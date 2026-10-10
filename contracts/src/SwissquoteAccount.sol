// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseAccount} from "account-abstraction/core/BaseAccount.sol";
import {SIG_VALIDATION_FAILED, SIG_VALIDATION_SUCCESS} from "account-abstraction/core/Helpers.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IRule} from "./IRule.sol";

/// Swissquote Wallet smart account, ERC-4337 with EntryPoint v0.7.
///
/// `signer` is the wallet key, split 2-of-3 with Shamir between the phone (A), Swissquote (B)
/// and an independent service (C). Every UserOperation signature starts with a mode byte:
///
/// - MODE_NORMAL: a wallet-key signature AND a WebAuthn assertion from the client's passkey,
///   both over the userOpHash. Swissquote and the independent service can rebuild the key
///   together but never hold the passkey, so even colluding they cannot move funds.
/// - MODE_RECOVERY: a wallet-key signature (rebuilt from B + C) AND a signature from the
///   client's recovery key kept at home. It may only call initiateRecovery. The new
///   credentials apply after RECOVERY_DELAY, during which the client (a normal operation from
///   the phone) or the guardian (Swissquote, for the client) can cancel.
contract SwissquoteAccount is BaseAccount, Initializable {
    using EnumerableSet for EnumerableSet.AddressSet;

    struct Passkey {
        bytes32 x;
        bytes32 y;
    }

    struct Config {
        address signer; // address of the Shamir-split wallet key
        Passkey passkey; // P-256 public key of the client's device passkey
        address recoveryKey; // offline key the client keeps at home
        address guardian; // may cancel a pending recovery
        address[] rules;
    }

    struct PendingRecovery {
        address signer;
        Passkey passkey;
        uint48 executeAfter;
    }

    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    uint8 public constant MODE_NORMAL = 0;
    uint8 public constant MODE_RECOVERY = 1;
    uint48 public constant RECOVERY_DELAY = 48 hours;

    IEntryPoint private immutable ENTRY_POINT;

    address public signer;
    Passkey public passkey;
    address public recoveryKey;
    address public guardian;
    PendingRecovery public pendingRecovery;
    EnumerableSet.AddressSet private _rules;

    event RuleAdded(address indexed rule);
    event RuleRemoved(address indexed rule);
    event GuardianChanged(address guardian);
    event RecoveryKeyChanged(address recoveryKey);
    event RecoveryInitiated(address signer, bytes32 passkeyX, bytes32 passkeyY, uint48 executeAfter);
    event RecoveryCancelled(address by);
    event RecoveryFinalized(address signer, bytes32 passkeyX, bytes32 passkeyY);

    error Unauthorized();
    error RecoveryPending();
    error NoRecoveryPending();
    error RecoveryNotReady(uint48 executeAfter);

    modifier onlyEntryPointOrSelf() {
        if (msg.sender != address(ENTRY_POINT) && msg.sender != address(this)) revert Unauthorized();
        _;
    }

    constructor(IEntryPoint entryPoint_) {
        ENTRY_POINT = entryPoint_;
        _disableInitializers();
    }

    function initialize(Config calldata config) external initializer {
        signer = config.signer;
        passkey = config.passkey;
        recoveryKey = config.recoveryKey;
        guardian = config.guardian;
        for (uint256 i; i < config.rules.length; ++i) {
            _rules.add(config.rules[i]);
        }
    }

    receive() external payable {}

    function entryPoint() public view override returns (IEntryPoint) {
        return ENTRY_POINT;
    }

    // ---------------------------------------------------------------- execution

    function execute(address target, uint256 value, bytes calldata data) external {
        _requireFromEntryPoint();
        _call(target, value, data);
    }

    function executeBatch(Call[] calldata calls) external {
        _requireFromEntryPoint();
        for (uint256 i; i < calls.length; ++i) {
            _call(calls[i].target, calls[i].value, calls[i].data);
        }
    }

    function _call(address target, uint256 value, bytes calldata data) internal {
        // Calls to the account itself are settings changes, already gated by MODE_NORMAL.
        // Skipping rules there means a faulty rule can always be removed.
        if (target != address(this)) {
            uint256 n = _rules.length();
            for (uint256 i; i < n; ++i) {
                IRule(_rules.at(i)).check(target, value, data);
            }
        }
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

        uint8 mode = uint8(sig[0]);
        if (mode == MODE_NORMAL) {
            return _isValidNormal(userOpHash, sig[1:]) ? SIG_VALIDATION_SUCCESS : SIG_VALIDATION_FAILED;
        }
        if (mode == MODE_RECOVERY && bytes4(userOp.callData) == this.initiateRecovery.selector) {
            (bytes memory keySig, bytes memory recoverySig) = abi.decode(sig[1:], (bytes, bytes));
            bool ok = _isSignedBy(signer, userOpHash, keySig) && _isSignedBy(recoveryKey, userOpHash, recoverySig);
            return ok ? SIG_VALIDATION_SUCCESS : SIG_VALIDATION_FAILED;
        }
        return SIG_VALIDATION_FAILED;
    }

    function _isValidNormal(bytes32 hash, bytes calldata sig) internal view returns (bool) {
        (bytes memory keySig, WebAuthn.WebAuthnAuth memory auth) = abi.decode(sig, (bytes, WebAuthn.WebAuthnAuth));
        return _isSignedBy(signer, hash, keySig) && WebAuthn.verify(abi.encodePacked(hash), auth, passkey.x, passkey.y);
    }

    function _isSignedBy(address expected, bytes32 hash, bytes memory sig) internal pure returns (bool) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(hash, sig);
        return err == ECDSA.RecoverError.NoError && recovered == expected && expected != address(0);
    }

    /// ERC-1271: lets exchanges and banks verify ownership proofs signed in MODE_NORMAL.
    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        bool ok = sig.length > 0 && uint8(sig[0]) == MODE_NORMAL && _isValidNormal(hash, sig[1:]);
        return ok ? this.isValidSignature.selector : bytes4(0xffffffff);
    }

    // ---------------------------------------------------------------- recovery

    function initiateRecovery(address newSigner, Passkey calldata newPasskey) external onlyEntryPointOrSelf {
        if (pendingRecovery.executeAfter != 0) revert RecoveryPending();
        uint48 executeAfter = uint48(block.timestamp) + RECOVERY_DELAY;
        pendingRecovery = PendingRecovery(newSigner, newPasskey, executeAfter);
        emit RecoveryInitiated(newSigner, newPasskey.x, newPasskey.y, executeAfter);
    }

    /// The client cancels from the phone (MODE_NORMAL), or Swissquote does it for them as guardian.
    function cancelRecovery() external {
        if (msg.sender != guardian && msg.sender != address(ENTRY_POINT) && msg.sender != address(this)) {
            revert Unauthorized();
        }
        if (pendingRecovery.executeAfter == 0) revert NoRecoveryPending();
        delete pendingRecovery;
        emit RecoveryCancelled(msg.sender);
    }

    /// Anyone may finalize once the delay has passed, so recovery completes even without Swissquote.
    function finalizeRecovery() external {
        PendingRecovery memory r = pendingRecovery;
        if (r.executeAfter == 0) revert NoRecoveryPending();
        if (block.timestamp < r.executeAfter) revert RecoveryNotReady(r.executeAfter);
        delete pendingRecovery;
        signer = r.signer;
        passkey = r.passkey;
        emit RecoveryFinalized(r.signer, r.passkey.x, r.passkey.y);
    }

    // ---------------------------------------------------------------- settings

    function addRule(address rule) external onlyEntryPointOrSelf {
        if (_rules.add(rule)) emit RuleAdded(rule);
    }

    function removeRule(address rule) external onlyEntryPointOrSelf {
        if (_rules.remove(rule)) emit RuleRemoved(rule);
    }

    function rules() external view returns (address[] memory) {
        return _rules.values();
    }

    function setGuardian(address guardian_) external onlyEntryPointOrSelf {
        guardian = guardian_;
        emit GuardianChanged(guardian_);
    }

    function setRecoveryKey(address recoveryKey_) external onlyEntryPointOrSelf {
        recoveryKey = recoveryKey_;
        emit RecoveryKeyChanged(recoveryKey_);
    }
}
