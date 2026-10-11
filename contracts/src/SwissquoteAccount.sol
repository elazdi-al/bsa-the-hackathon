// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseAccount} from "account-abstraction/core/BaseAccount.sol";
import {SIG_VALIDATION_FAILED, SIG_VALIDATION_SUCCESS} from "account-abstraction/core/Helpers.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";

/// Swissquote Wallet smart account, ERC-4337 with EntryPoint v0.7.
///
/// `signer` is the wallet key, split 2-of-3 with Shamir: Share A on the phone, B at Swissquote,
/// C at an independent service. Every UserOperation signature starts with a mode byte:
///
/// - MODE_NORMAL: the wallet key's signature AND a WebAuthn assertion from the user's passkey,
///   both over the userOpHash. Swissquote and the independent service together can rebuild the
///   wallet key, but never the passkey, so they still cannot move funds.
/// - MODE_RECOVERY: the wallet key's signature (rebuilt from Shares B and C) AND a signature from
///   the user's recovery key kept at home. It may only call initiateRecovery. The new key and
///   passkey apply after RECOVERY_DELAY, during which the user (a normal operation from the
///   phone) or Swissquote (guardian) can cancel.
contract SwissquoteAccount is BaseAccount, Initializable {
    struct Passkey {
        bytes32 x;
        bytes32 y;
    }

    struct Config {
        address signer; // address of the Shamir-shared wallet key
        Passkey passkey; // P-256 public key of the user's phone passkey
        address recoveryKey; // the key the user keeps at home
        address guardian; // Swissquote: may cancel a pending recovery
    }

    struct PendingRecovery {
        address signer;
        Passkey passkey;
        uint48 executeAfter;
    }

    uint8 public constant MODE_NORMAL = 0;
    uint8 public constant MODE_RECOVERY = 1;
    /// 48 hours, as the protocol requires. Only a test chain's deployment picks a shorter one, so a demo can finish a recovery.
    uint48 public immutable RECOVERY_DELAY;

    IEntryPoint private immutable ENTRY_POINT;

    address public signer;
    Passkey public passkey;
    address public recoveryKey;
    address public guardian;
    PendingRecovery public pendingRecovery;

    event RecoveryInitiated(address signer, bytes32 passkeyX, bytes32 passkeyY, uint48 executeAfter);
    event RecoveryCancelled(address by);
    event RecoveryFinalized(address signer, bytes32 passkeyX, bytes32 passkeyY);

    error Unauthorized();
    error RecoveryPending();
    error NoRecoveryPending();
    error RecoveryNotReady(uint48 executeAfter);

    constructor(IEntryPoint entryPoint_, uint48 recoveryDelay) {
        ENTRY_POINT = entryPoint_;
        RECOVERY_DELAY = recoveryDelay;
        _disableInitializers();
    }

    function initialize(Config calldata config) external initializer {
        signer = config.signer;
        passkey = config.passkey;
        recoveryKey = config.recoveryKey;
        guardian = config.guardian;
    }

    receive() external payable {}

    function entryPoint() public view override returns (IEntryPoint) {
        return ENTRY_POINT;
    }

    function execute(address target, uint256 value, bytes calldata data) external {
        _requireFromEntryPoint();
        (bool ok, bytes memory result) = target.call{value: value}(data);
        if (!ok) {
            assembly ("memory-safe") {
                revert(add(result, 32), mload(result))
            }
        }
    }

    // ---------------------------------------------------------------- validation

    function _validateSignature(PackedUserOperation calldata userOp, bytes32 userOpHash)
        internal
        view
        override
        returns (uint256)
    {
        bytes calldata sig = userOp.signature;
        if (sig.length == 0) return SIG_VALIDATION_FAILED;

        bool recovery = bytes4(userOp.callData) == this.initiateRecovery.selector;
        uint8 mode = uint8(sig[0]);
        bool ok;
        if (mode == MODE_NORMAL && !recovery) {
            (bytes memory keySig, WebAuthn.WebAuthnAuth memory auth) = abi.decode(sig[1:], (bytes, WebAuthn.WebAuthnAuth));
            ok = _isSignedBy(signer, userOpHash, keySig)
                && WebAuthn.verify(abi.encodePacked(userOpHash), auth, passkey.x, passkey.y);
        } else if (mode == MODE_RECOVERY && recovery) {
            (bytes memory keySig, bytes memory recoverySig) = abi.decode(sig[1:], (bytes, bytes));
            ok = _isSignedBy(signer, userOpHash, keySig) && _isSignedBy(recoveryKey, userOpHash, recoverySig);
        }
        return ok ? SIG_VALIDATION_SUCCESS : SIG_VALIDATION_FAILED;
    }

    function _isSignedBy(address expected, bytes32 hash, bytes memory sig) internal pure returns (bool) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(hash, sig);
        return err == ECDSA.RecoverError.NoError && recovered == expected && expected != address(0);
    }

    // ---------------------------------------------------------------- recovery

    /// Only as a MODE_RECOVERY UserOperation: Shamir Shares B + C and the recovery key.
    function initiateRecovery(address newSigner, Passkey calldata newPasskey) external {
        _requireFromEntryPoint();
        if (pendingRecovery.executeAfter != 0) revert RecoveryPending();
        uint48 executeAfter = uint48(block.timestamp) + RECOVERY_DELAY;
        pendingRecovery = PendingRecovery(newSigner, newPasskey, executeAfter);
        emit RecoveryInitiated(newSigner, newPasskey.x, newPasskey.y, executeAfter);
    }

    /// The user cancels from the phone (MODE_NORMAL, through execute), or Swissquote does it for them as guardian.
    function cancelRecovery() external {
        if (msg.sender != guardian && msg.sender != address(this)) revert Unauthorized();
        if (pendingRecovery.executeAfter == 0) revert NoRecoveryPending();
        delete pendingRecovery;
        emit RecoveryCancelled(msg.sender);
    }

    /// Anyone may finalize once the delay has passed. Same account, so same address and funds.
    function finalizeRecovery() external {
        PendingRecovery memory r = pendingRecovery;
        if (r.executeAfter == 0) revert NoRecoveryPending();
        if (block.timestamp < r.executeAfter) revert RecoveryNotReady(r.executeAfter);
        delete pendingRecovery;
        signer = r.signer;
        passkey = r.passkey;
        emit RecoveryFinalized(r.signer, r.passkey.x, r.passkey.y);
    }
}
