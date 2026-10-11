// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {EntryPoint} from "account-abstraction/core/EntryPoint.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {VerifyingPaymaster} from "account-abstraction/samples/VerifyingPaymaster.sol";
import {SwissquoteAccountFactory} from "../src/SwissquoteAccountFactory.sol";
import {TestUSDC} from "./TestUSDC.sol";
import {TestVault} from "./TestVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Deploys the factory, Swissquote's funded VerifyingPaymaster, a mintable test USDC and a test vault for it.
/// A fresh local chain also gets its own EntryPoint v0.7. RECOVERY_DELAY (seconds, default 48 hours) sets
/// every account's recovery hold.
///   forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $SWISSQUOTE_KEY --broadcast
contract Deploy is Script {
    IEntryPoint constant CANONICAL_ENTRY_POINT = IEntryPoint(0x0000000071727De22E5E9d8BAf0edAc6f37da032);

    function run() external {
        address swissquote = vm.envAddress("SWISSQUOTE_ADDRESS");
        uint256 deposit = vm.envOr("PAYMASTER_DEPOSIT", uint256(0.05 ether));
        uint48 recoveryDelay = uint48(vm.envOr("RECOVERY_DELAY", uint256(48 hours)));
        bool local = block.chainid == 31337;

        vm.startBroadcast();
        IEntryPoint entryPoint = local ? IEntryPoint(address(new EntryPoint())) : CANONICAL_ENTRY_POINT;
        address usdc = address(new TestUSDC());
        TestVault vault = new TestVault(IERC20(usdc));
        SwissquoteAccountFactory factory = new SwissquoteAccountFactory(entryPoint, recoveryDelay);
        VerifyingPaymaster paymaster = new VerifyingPaymaster(entryPoint, swissquote);
        paymaster.deposit{value: deposit}();
        vm.stopBroadcast();

        console.log("ENTRY_POINT_ADDRESS=%s", address(entryPoint));
        console.log("USDC_ADDRESS=%s", usdc);
        console.log("VAULT_ADDRESS=%s", address(vault));
        console.log("FACTORY_ADDRESS=%s", address(factory));
        console.log("PAYMASTER_ADDRESS=%s", address(paymaster));
    }
}
