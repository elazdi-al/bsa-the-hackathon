// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// Stands in for WETH on a local chain. Anyone may mint.
contract TestWETH is ERC20("Wrapped Ether", "WETH") {
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// A USDC/WETH constant-product pool on a local chain, priced from its own balances, 0.3% fee on input.
contract TestPool {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IERC20 public immutable weth;

    event Swap(
        address indexed account, address indexed tokenIn, uint256 amountIn, address indexed tokenOut, uint256 amountOut
    );

    error Slippage(uint256 amountOut, uint256 minAmountOut);
    error UnknownToken();

    constructor(IERC20 usdc_, IERC20 weth_) {
        usdc = usdc_;
        weth = weth_;
    }

    function reserves() external view returns (uint256 usdcReserve, uint256 wethReserve) {
        return (usdc.balanceOf(address(this)), weth.balanceOf(address(this)));
    }

    function quote(address tokenIn, uint256 amountIn) public view returns (uint256 amountOut) {
        (IERC20 input, IERC20 output) = _pair(tokenIn);
        uint256 reserveIn = input.balanceOf(address(this));
        uint256 reserveOut = output.balanceOf(address(this));
        return reserveOut * amountIn * 997 / (reserveIn * 1000 + amountIn * 997);
    }

    function swap(address tokenIn, uint256 amountIn, uint256 minAmountOut) external returns (uint256 amountOut) {
        (IERC20 input, IERC20 output) = _pair(tokenIn);
        amountOut = quote(tokenIn, amountIn);
        if (amountOut < minAmountOut) revert Slippage(amountOut, minAmountOut);
        input.safeTransferFrom(msg.sender, address(this), amountIn);
        output.safeTransfer(msg.sender, amountOut);
        emit Swap(msg.sender, tokenIn, amountIn, address(output), amountOut);
    }

    function _pair(address tokenIn) private view returns (IERC20 input, IERC20 output) {
        if (tokenIn == address(usdc)) return (usdc, weth);
        if (tokenIn == address(weth)) return (weth, usdc);
        revert UnknownToken();
    }
}
