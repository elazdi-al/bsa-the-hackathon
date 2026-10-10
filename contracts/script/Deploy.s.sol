// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {VerifyingPaymaster} from "account-abstraction/samples/VerifyingPaymaster.sol";
import {SwissquoteAccountFactory} from "../src/SwissquoteAccountFactory.sol";
import {SpendingLimitRule} from "../src/rules/SpendingLimitRule.sol";

/// Deploys the factory, Swissquote's VerifyingPaymaster (funded) and the spending-limit rule
/// against the canonical EntryPoint v0.7.
///   forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $SWISSQUOTE_KEY --broadcast
contract Deploy is Script {
    IEntryPoint constant ENTRY_POINT = IEntryPoint(0x0000000071727De22E5E9d8BAf0edAc6f37da032);

    function run() external {
        address swissquote = vm.envAddress("SWISSQUOTE_ADDRESS");
        uint256 deposit = vm.envOr("PAYMASTER_DEPOSIT", uint256(0.05 ether));

        vm.startBroadcast();
        SwissquoteAccountFactory factory = new SwissquoteAccountFactory(ENTRY_POINT);
        VerifyingPaymaster paymaster = new VerifyingPaymaster(ENTRY_POINT, swissquote);
        paymaster.deposit{value: deposit}();
        SpendingLimitRule rule = new SpendingLimitRule();
        vm.stopBroadcast();

        console.log("FACTORY_ADDRESS=%s", address(factory));
        console.log("PAYMASTER_ADDRESS=%s", address(paymaster));
        console.log("SPENDING_LIMIT_RULE_ADDRESS=%s", address(rule));
    }
}
