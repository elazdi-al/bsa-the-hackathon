// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
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
import {SpendingLimitRule} from "../src/rules/SpendingLimitRule.sol";
import {TestUSDC} from "../script/TestUSDC.sol";

contract SwissquoteAccountTest is Test {
    uint256 constant P256_N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;

    EntryPoint entryPoint;
    SwissquoteAccountFactory factory;
    VerifyingPaymaster paymaster;
    SpendingLimitRule limitRule;
    TestUSDC usdc;
    SwissquoteAccount account;

    // The Shamir-split wallet key is a single ECDSA key on-chain.
    uint256 walletKey = 0xA11CE;
    uint256 passkeyKey = 0xFACE1D; // P-256
    uint256 recoveryKey = 0xC0FFEE;
    uint256 paymasterSigner = 0x5157;
    address guardian = makeAddr("swissquote-guardian");
    address bundler = makeAddr("bundler");
    address anna = makeAddr("anna");

    function setUp() public {
        entryPoint = new EntryPoint();
        factory = new SwissquoteAccountFactory(entryPoint);
        paymaster = new VerifyingPaymaster(entryPoint, vm.addr(paymasterSigner));
        paymaster.deposit{value: 10 ether}();
        limitRule = new SpendingLimitRule();
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

    function test_walletKeyAloneCannotTransfer() public {
        // Swissquote and the independent service can rebuild the wallet key, but not the client's passkey.
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

    function test_ownershipProofViaErc1271() public {
        _deploy();
        bytes32 h = keccak256("Swissquote client 123456 controls this wallet");
        bytes memory sig = abi.encodePacked(MODE_NORMAL(), abi.encode(_ecdsa(walletKey, h), _webauthn(passkeyKey, h)));
        assertEq(account.isValidSignature(h, sig), account.isValidSignature.selector);
        sig = abi.encodePacked(MODE_NORMAL(), abi.encode(_ecdsa(walletKey, h), _webauthn(0xBAD, h)));
        assertEq(account.isValidSignature(h, sig), bytes4(0xffffffff));
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

        vm.warp(block.timestamp + account.RECOVERY_DELAY());
        vm.expectRevert(SwissquoteAccount.NoRecoveryPending.selector);
        account.finalizeRecovery();
        assertEq(account.signer(), vm.addr(walletKey));
    }

    function test_clientCancelsRecoveryFromPhone() public {
        _deploy();
        _initiateRecovery(0xB0B, 0xBEEF, walletKey, recoveryKey);

        PackedUserOperation memory op = _op(abi.encodeCall(SwissquoteAccount.cancelRecovery, ()), false);
        _signNormal(op, walletKey, passkeyKey);
        _handle(op);

        (,, uint48 executeAfter) = account.pendingRecovery();
        assertEq(executeAfter, 0);
    }

    // ---------------------------------------------------------------- rules

    function test_spendingLimitRule() public {
        _deploy();
        _execOk(address(limitRule), abi.encodeCall(SpendingLimitRule.setLimit, (address(usdc), 100e6)));

        _execOk(address(usdc), abi.encodeCall(IERC20.transfer, (anna, 60e6)));
        _exec(address(usdc), abi.encodeCall(IERC20.transfer, (anna, 60e6))); // 120 > 100, reverts in execution
        assertEq(usdc.balanceOf(anna), 80e6, "20 from deploy + 60");

        // Raising waits a day; lowering is immediate.
        _execOk(address(limitRule), abi.encodeCall(SpendingLimitRule.setLimit, (address(usdc), 500e6)));
        (uint256 daily,,,,) = limitRule.limits(address(account), address(usdc));
        assertEq(daily, 100e6);

        vm.warp(block.timestamp + 1 days);
        _execOk(address(usdc), abi.encodeCall(IERC20.transfer, (anna, 300e6)));
        assertEq(usdc.balanceOf(anna), 380e6);
    }

    function test_removedRuleNoLongerApplies() public {
        _deploy();
        _execOk(address(limitRule), abi.encodeCall(SpendingLimitRule.setLimit, (address(usdc), 1e6)));
        _execOk(address(account), abi.encodeCall(SwissquoteAccount.removeRule, (address(limitRule))));
        _execOk(address(usdc), abi.encodeCall(IERC20.transfer, (anna, 50e6)));
        assertEq(account.rules().length, 0);
    }

    // ---------------------------------------------------------------- helpers

    function MODE_NORMAL() internal pure returns (uint8) {
        return 0;
    }

    function _config() internal view returns (SwissquoteAccount.Config memory c) {
        c.signer = vm.addr(walletKey);
        c.passkey = _passkey(passkeyKey);
        c.recoveryKey = vm.addr(recoveryKey);
        c.guardian = guardian;
        c.rules = new address[](1);
        c.rules[0] = address(limitRule);
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

    function _initiateRecovery(uint256 newKey, uint256 newPasskey, uint256 key, uint256 recovery) internal {
        PackedUserOperation memory op = _op(_initiateRecoveryCall(newKey, newPasskey), false);
        _signRecovery(op, key, recovery);
        _handle(op);
    }

    function _deploy() internal {
        PackedUserOperation memory op = _op(_transfer(anna, 20e6), true);
        _signNormal(op, walletKey, passkeyKey);
        _handle(op);
    }

    function _exec(address target, bytes memory data) internal returns (bool success) {
        PackedUserOperation memory op = _op(abi.encodeCall(SwissquoteAccount.execute, (target, 0, data)), false);
        _signNormal(op, walletKey, passkeyKey);
        vm.recordLogs();
        _handle(op);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == IEntryPoint.UserOperationEvent.selector) {
                (, success,,) = abi.decode(logs[i].data, (uint256, bool, uint256, uint256));
            }
        }
    }

    function _execOk(address target, bytes memory data) internal {
        assertTrue(_exec(target, data), "user operation reverted");
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

        // Swissquote's Wallet API signs the sponsorship after its policy checks pass.
        uint48 validUntil = uint48(block.timestamp + 120);
        op.paymasterAndData =
            abi.encodePacked(address(paymaster), uint128(60_000), uint128(0), abi.encode(validUntil, uint48(0)));
        bytes32 h = MessageHashUtils.toEthSignedMessageHash(paymaster.getHash(op, validUntil, 0));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(paymasterSigner, h);
        op.paymasterAndData = abi.encodePacked(op.paymasterAndData, r, s, v);
    }

    function _signNormal(PackedUserOperation memory op, uint256 key, uint256 passkey) internal view {
        bytes32 h = entryPoint.getUserOpHash(op);
        op.signature = abi.encodePacked(uint8(0), abi.encode(_ecdsa(key, h), _webauthn(passkey, h)));
    }

    function _signRecovery(PackedUserOperation memory op, uint256 key, uint256 recovery) internal view {
        bytes32 h = entryPoint.getUserOpHash(op);
        op.signature = abi.encodePacked(uint8(1), abi.encode(_ecdsa(key, h), _ecdsa(recovery, h)));
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
