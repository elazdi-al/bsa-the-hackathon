// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Test-chain integration fixture only. Holds the underlying; no yield, strategy, admin or bank guarantee.
contract TestVault is ERC4626 {
    constructor(IERC20 underlying) ERC20("Demo USDC Vault", "demoUSDC") ERC4626(underlying) {}
}
