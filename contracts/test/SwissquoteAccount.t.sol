// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {EntryPoint} from "account-abstraction/core/EntryPoint.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {VerifyingPaymaster} from "account-abstraction/samples/VerifyingPaymaster.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";
import {SwissquoteAccount} from "../src/SwissquoteAccount.sol";
import {SwissquoteAccountFactory} from "../src/SwissquoteAccountFactory.sol";
import {TestUSDC} from "../script/TestUSDC.sol";
import {TestVault} from "../script/TestVault.sol";

contract SwissquoteAccountTest is Test {
    uint256 constant P256_N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;

    EntryPoint entryPoint;
    SwissquoteAccountFactory factory;
    VerifyingPaymaster paymaster;
    TestUSDC usdc;
    SwissquoteAccount account;

    // The Shamir-shared wallet key is a single ECDSA key on-chain, so one test key stands in for it.
    uint256 walletKey = 0xA11CE;
    uint256 passkeyKey = 0xFACE1D; // P-256
    uint256 recoveryKey = 0xC0FFEE;
    uint256 paymasterSigner = 0x5157;
    address guardian = makeAddr("swissquote-guardian");
    address bundler = makeAddr("bundler");
    address anna = makeAddr("anna");

    function setUp() public {
        entryPoint = new EntryPoint();
        factory = new SwissquoteAccountFactory(entryPoint, 48 hours);
        paymaster = new VerifyingPaymaster(entryPoint, vm.addr(paymasterSigner));
        paymaster.deposit{value: 10 ether}();
        usdc = new TestUSDC();

        account = SwissquoteAccount(payable(factory.getAddress(_config(), 0)));
        usdc.mint(address(account), 1_000e6);
    }

    // ---------------------------------------------------------------- normal operation

    function test_sponsoredTransferDeploysAccount() public {
        PackedUserOperation memory op = _op(_transfer(anna, 20e6), true);
        _signNormal(op, walletKey, passkeyKey);
        _handle(op);

        assertEq(usdc.balanceOf(anna), 20e6);
        assertGt(address(account).code.length, 0);
        assertEq(address(account).balance, 0, "client never needs ETH");
        assertLt(entryPoint.balanceOf(address(paymaster)), 10 ether, "Swissquote paid the gas");
    }

    function test_sponsoredVaultApprovalDepositWithdrawAndRevoke() public {
        TestVault vault = new TestVault(IERC20(address(usdc)));
        bytes memory approve = abi.encodeCall(SwissquoteAccount.execute,
            (address(usdc), 0, abi.encodeCall(IERC20.approve, (address(vault), 25e6))));
        PackedUserOperation memory op = _op(approve, true);
        _signNormal(op, walletKey, passkeyKey);
        _handle(op);
        assertEq(usdc.allowance(address(account), address(vault)), 25e6);

        op = _op(abi.encodeCall(SwissquoteAccount.execute,
            (address(vault), 0, abi.encodeCall(vault.deposit, (25e6, address(account))))), false);
        _signNormal(op, walletKey, passkeyKey);
        _handle(op);
        assertEq(vault.balanceOf(address(account)), 25e6);
        assertEq(usdc.allowance(address(account), address(vault)), 0);

        op = _op(abi.encodeCall(SwissquoteAccount.execute,
            (address(vault), 0, abi.encodeCall(vault.withdraw, (10e6, address(account), address(account))))), false);
        _signNormal(op, walletKey, passkeyKey);
        _handle(op);
        assertEq(vault.balanceOf(address(account)), 15e6);
        assertEq(usdc.balanceOf(address(account)), 985e6);

        op = _op(abi.encodeCall(SwissquoteAccount.execute,
            (address(usdc), 0, abi.encodeCall(IERC20.approve, (address(vault), 0)))), false);
        _signNormal(op, walletKey, passkeyKey);
        _handle(op);
        assertEq(address(account).balance, 0, "all vault operations were sponsored");
    }

    function test_walletKeyAloneCannotTransfer() public {
        // Swissquote + the independent service can rebuild the wallet key, but not the user's passkey.
        PackedUserOperation memory op = _op(_transfer(anna, 20e6), true);
        _signNormal(op, walletKey, 0xBAD);
        _expectSigError();
        _handle(op);
    }

    function test_passkeyAloneCannotTransfer() public {
        PackedUserOperation memory op = _op(_transfer(anna, 20e6), true);
        _signNormal(op, 0xBAD, passkeyKey);
        _expectSigError();
        _handle(op);
    }

    function test_unsponsoredOpIsRejected() public {
        PackedUserOperation memory op = _op(_transfer(anna, 20e6), true);
        op.paymasterAndData = abi.encodePacked(op.paymasterAndData, bytes1(0)); // tamper
        _signNormal(op, walletKey, passkeyKey);
        vm.expectRevert();
        _handle(op);
    }

    // ---------------------------------------------------------------- recovery

    function test_recoveryFlow() public {
        _deploy();
        uint256 newKey = 0xB0B;
        uint256 newPasskey = 0xBEEF;

        _initiateRecovery(newKey, newPasskey, walletKey, recoveryKey);
        (,, uint48 executeAfter) = account.pendingRecovery();
        assertEq(executeAfter, block.timestamp + 48 hours);

        vm.expectRevert(abi.encodeWithSelector(SwissquoteAccount.RecoveryNotReady.selector, executeAfter));
        account.finalizeRecovery();

        vm.warp(executeAfter);
        account.finalizeRecovery(); // anyone may finalize
        assertEq(account.signer(), vm.addr(newKey));

        // Old phone's credentials are dead, new ones work, same address and balance.
        PackedUserOperation memory op = _op(_transfer(anna, 5e6), false);
        _signNormal(op, walletKey, passkeyKey);
        _expectSigError();
        _handle(op);

        _signNormal(op, newKey, newPasskey);
        _handle(op);
        assertEq(usdc.balanceOf(anna), 25e6);
    }

    function test_factorySetsTheRecoveryDelay() public {
        // A test chain's factory: its clones run the implementation's code, so they get its shorter hold.
        factory = new SwissquoteAccountFactory(entryPoint, 10 minutes);
        account = SwissquoteAccount(payable(factory.getAddress(_config(), 0)));
        usdc.mint(address(account), 1_000e6);
        _deploy();

        _initiateRecovery(0xB0B, 0xBEEF, walletKey, recoveryKey);
        (,, uint48 executeAfter) = account.pendingRecovery();
        assertEq(executeAfter, block.timestamp + 10 minutes);
    }

    function test_recoveryNeedsRecoveryKey() public {
        _deploy();
        PackedUserOperation memory op = _op(_initiateRecoveryCall(0xB0B, 0xBEEF), false);
        _signRecovery(op, walletKey, 0xBAD);
        _expectSigError();
        _handle(op);
    }

    function test_recoveryModeCannotMoveFunds() public {
        _deploy();
        PackedUserOperation memory op = _op(_transfer(anna, 5e6), false);
        _signRecovery(op, walletKey, recoveryKey);
        _expectSigError();
        _handle(op);
    }

    function test_guardianCancelsRecovery() public {
        _deploy();
        _initiateRecovery(0xB0B, 0xBEEF, walletKey, recoveryKey);

        vm.expectRevert(SwissquoteAccount.Unauthorized.selector);
        vm.prank(anna);
        account.cancelRecovery();

        vm.prank(guardian);
        account.cancelRecovery();

        vm.warp(block.timestamp + 48 hours);
        vm.expectRevert(SwissquoteAccount.NoRecoveryPending.selector);
        account.finalizeRecovery();
        assertEq(account.signer(), vm.addr(walletKey));
    }

    function test_clientCancelsRecoveryFromPhone() public {
        _deploy();
        _initiateRecovery(0xB0B, 0xBEEF, walletKey, recoveryKey);

        PackedUserOperation memory op = _op(
            abi.encodeCall(
                SwissquoteAccount.execute, (address(account), 0, abi.encodeCall(SwissquoteAccount.cancelRecovery, ()))
            ),
            false
        );
        _signNormal(op, walletKey, passkeyKey);
        _handle(op);

        (,, uint48 executeAfter) = account.pendingRecovery();
        assertEq(executeAfter, 0);
    }

    function test_passkeyCannotStartRecovery() public {
        // Recovery is only Shares B + C with the recovery key, never the phone's credentials.
        _deploy();
        PackedUserOperation memory op = _op(_initiateRecoveryCall(0xB0B, 0xBEEF), false);
        _signNormal(op, walletKey, passkeyKey);
        _expectSigError();
        _handle(op);
    }

    function test_recoveryCannotBeStartedThroughExecute() public {
        _deploy();
        PackedUserOperation memory op = _op(
            abi.encodeCall(SwissquoteAccount.execute, (address(account), 0, _initiateRecoveryCall(0xB0B, 0xBEEF))), false
        );
        _signNormal(op, walletKey, passkeyKey);
        _handle(op); // the inner call reverts, the operation is still included
        (,, uint48 executeAfter) = account.pendingRecovery();
        assertEq(executeAfter, 0);
    }

    // ---------------------------------------------------------------- helpers

    function _config() internal view returns (SwissquoteAccount.Config memory c) {
        c.signer = vm.addr(walletKey);
        c.passkey = _passkey(passkeyKey);
        c.recoveryKey = vm.addr(recoveryKey);
        c.guardian = guardian;
    }

    function _passkey(uint256 key) internal pure returns (SwissquoteAccount.Passkey memory) {
        (uint256 x, uint256 y) = vm.publicKeyP256(key);
        return SwissquoteAccount.Passkey(bytes32(x), bytes32(y));
    }

    function _transfer(address to, uint256 amount) internal view returns (bytes memory) {
        return abi.encodeCall(SwissquoteAccount.execute, (address(usdc), 0, abi.encodeCall(IERC20.transfer, (to, amount))));
    }

    function _initiateRecoveryCall(uint256 newKey, uint256 newPasskey) internal pure returns (bytes memory) {
        return abi.encodeCall(SwissquoteAccount.initiateRecovery, (vm.addr(newKey), _passkey(newPasskey)));
    }

    function _initiateRecovery(uint256 newKey, uint256 newPasskey, uint256 key, uint256 confirm) internal {
        PackedUserOperation memory op = _op(_initiateRecoveryCall(newKey, newPasskey), false);
        _signRecovery(op, key, confirm);
        _handle(op);
    }

    function _deploy() internal {
        PackedUserOperation memory op = _op(_transfer(anna, 20e6), true);
        _signNormal(op, walletKey, passkeyKey);
        _handle(op);
    }

    function _op(bytes memory callData, bool deploy) internal view returns (PackedUserOperation memory op) {
        op.sender = address(account);
        op.nonce = entryPoint.getNonce(address(account), 0);
        if (deploy) {
            op.initCode = abi.encodePacked(address(factory), abi.encodeCall(factory.createAccount, (_config(), 0)));
        }
        op.callData = callData;
        op.accountGasLimits = bytes32((uint256(1_500_000) << 128) | 300_000); // verification | call
        op.preVerificationGas = 60_000;
        op.gasFees = bytes32((uint256(1 gwei) << 128) | 2 gwei); // priority | max

        _sponsor(op, uint48(block.timestamp + 120), 0);
    }

    /// Swissquote's Wallet API signs the sponsorship: it pays the gas, between validAfter and validUntil.
    function _sponsor(PackedUserOperation memory op, uint48 validUntil, uint48 validAfter) internal view {
        op.paymasterAndData =
            abi.encodePacked(address(paymaster), uint128(60_000), uint128(0), abi.encode(validUntil, validAfter));
        bytes32 h = MessageHashUtils.toEthSignedMessageHash(paymaster.getHash(op, validUntil, validAfter));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(paymasterSigner, h);
        op.paymasterAndData = abi.encodePacked(op.paymasterAndData, r, s, v);
    }

    function _signNormal(PackedUserOperation memory op, uint256 key, uint256 passkey) internal view {
        bytes32 h = entryPoint.getUserOpHash(op);
        op.signature = abi.encodePacked(uint8(0), abi.encode(_ecdsa(key, h), _webauthn(passkey, h)));
    }

    function _signRecovery(PackedUserOperation memory op, uint256 key, uint256 confirm) internal view {
        bytes32 h = entryPoint.getUserOpHash(op);
        op.signature = abi.encodePacked(uint8(1), abi.encode(_ecdsa(key, h), _ecdsa(confirm, h)));
    }

    function _ecdsa(uint256 key, bytes32 h) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, h);
        return abi.encodePacked(r, s, v);
    }

    function _webauthn(uint256 key, bytes32 h) internal pure returns (WebAuthn.WebAuthnAuth memory auth) {
        auth.authenticatorData = abi.encodePacked(sha256("wallet.swissquote.ch"), bytes1(0x05), uint32(1)); // UP | UV
        auth.clientDataJSON = string.concat(
            '{"type":"webauthn.get","challenge":"',
            Base64.encodeURL(abi.encodePacked(h)),
            '","origin":"https://wallet.swissquote.ch","crossOrigin":false}'
        );
        auth.typeIndex = 1;
        auth.challengeIndex = 23;
        (bytes32 r, bytes32 s) =
            vm.signP256(key, sha256(abi.encodePacked(auth.authenticatorData, sha256(bytes(auth.clientDataJSON)))));
        if (uint256(s) > P256_N / 2) s = bytes32(P256_N - uint256(s));
        (auth.r, auth.s) = (r, s);
    }

    function _handle(PackedUserOperation memory op) internal {
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        entryPoint.handleOps(ops, payable(bundler));
    }

    function _expectSigError() internal {
        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA24 signature error"));
    }
}
