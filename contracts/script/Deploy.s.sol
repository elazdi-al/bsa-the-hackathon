// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {EntryPoint} from "account-abstraction/core/EntryPoint.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {VerifyingPaymaster} from "account-abstraction/samples/VerifyingPaymaster.sol";
import {SwissquoteAccountFactory} from "../src/SwissquoteAccountFactory.sol";
import {SpendingLimitRule} from "../src/rules/SpendingLimitRule.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

/// Deploys the factory, Swissquote's funded VerifyingPaymaster and the spending-limit rule. A
/// fresh local chain also gets its own EntryPoint v0.7 and a mintable USDC.
///   forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $SWISSQUOTE_KEY --broadcast
contract Deploy is Script {
    IEntryPoint constant CANONICAL_ENTRY_POINT = IEntryPoint(0x0000000071727De22E5E9d8BAf0edAc6f37da032);
    address constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        address swissquote = vm.envAddress("SWISSQUOTE_ADDRESS");
        uint256 deposit = vm.envOr("PAYMASTER_DEPOSIT", uint256(0.05 ether));
        bool local = block.chainid == 31337;

        vm.startBroadcast();
        IEntryPoint entryPoint = local ? IEntryPoint(address(new EntryPoint())) : CANONICAL_ENTRY_POINT;
        address usdc = local ? address(new TestUSDC()) : BASE_SEPOLIA_USDC;
        SwissquoteAccountFactory factory = new SwissquoteAccountFactory(entryPoint);
        VerifyingPaymaster paymaster = new VerifyingPaymaster(entryPoint, swissquote);
        paymaster.deposit{value: deposit}();
        SpendingLimitRule rule = new SpendingLimitRule();
        vm.stopBroadcast();

        console.log("ENTRY_POINT_ADDRESS=%s", address(entryPoint));
        console.log("USDC_ADDRESS=%s", usdc);
        console.log("FACTORY_ADDRESS=%s", address(factory));
        console.log("PAYMASTER_ADDRESS=%s", address(paymaster));
        console.log("SPENDING_LIMIT_RULE_ADDRESS=%s", address(rule));
    }
}
