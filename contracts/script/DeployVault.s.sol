// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TestVault} from "./TestVault.sol";

/// Adds only a test vault to an existing test chain. Does not replace any wallet infrastructure.
contract DeployVault is Script {
    function run() external {
        require(block.chainid == 31337 || block.chainid == 84532, "Test chains only");
        IERC20 usdc = IERC20(vm.envAddress("USDC_ADDRESS"));
        vm.startBroadcast();
        TestVault vault = new TestVault(usdc);
        vm.stopBroadcast();
        console.log("VAULT_ADDRESS=%s", address(vault));
    }
}
