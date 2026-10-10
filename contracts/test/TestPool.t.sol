// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {TestUSDC} from "../script/TestUSDC.sol";
import {TestPool, TestWETH} from "../script/TestPool.sol";

contract TestPoolTest is Test {
    TestUSDC usdc;
    TestWETH weth;
    TestPool pool;
    address anna = makeAddr("anna");
    address bob = makeAddr("bob");

    function setUp() public {
        usdc = new TestUSDC();
        weth = new TestWETH();
        pool = new TestPool(usdc, weth);
        usdc.mint(address(pool), 250_000e6);
        weth.mint(address(pool), 100e18);
    }

    function test_quoteIsConstantProductLessFee() public view {
        // 1 ETH = 2,500 USDC: 2,500 USDC buys a little under 1 WETH after the 0.3% fee and price impact.
        assertEq(pool.quote(address(usdc), 2_500e6), 987158034397061298);
        assertEq(pool.quote(address(usdc), 100e6), 39864102196044217);
    }

    function test_swapUpdatesReserves() public {
        usdc.mint(anna, 2_500e6);
        vm.startPrank(anna);
        usdc.approve(address(pool), 2_500e6);
        uint256 out = pool.swap(address(usdc), 2_500e6, 0);
        (uint256 usdcReserve, uint256 wethReserve) = pool.reserves();
        assertEq(usdcReserve, 252_500e6);
        assertEq(wethReserve, 100e18 - out);
    }

    function test_slippageReverts() public {
        uint256 quoted = pool.quote(address(usdc), 2_500e6);
        usdc.mint(anna, 2_500e6);
        vm.startPrank(anna);
        usdc.approve(address(pool), 2_500e6);
        vm.expectRevert(abi.encodeWithSelector(TestPool.Slippage.selector, quoted, quoted + 1));
        pool.swap(address(usdc), 2_500e6, quoted + 1);
    }

    function test_unknownTokenReverts() public {
        TestUSDC other = new TestUSDC();
        vm.expectRevert(TestPool.UnknownToken.selector);
        pool.quote(address(other), 1e6);

        other.mint(anna, 1e6);
        vm.startPrank(anna);
        other.approve(address(pool), 1e6);
        vm.expectRevert(TestPool.UnknownToken.selector);
        pool.swap(address(other), 1e6, 0);
    }

    function test_swapOnlyPullsFromAndPaysTheCaller() public {
        usdc.mint(bob, 2_500e6);
        vm.prank(bob);
        usdc.approve(address(pool), 2_500e6);

        // Bob's allowance is useless to anyone else.
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(pool), 0, 2_500e6)
        );
        vm.prank(anna);
        pool.swap(address(usdc), 2_500e6, 0);

        vm.prank(bob);
        uint256 out = pool.swap(address(usdc), 2_500e6, 0);
        assertEq(weth.balanceOf(bob), out);
        assertEq(weth.balanceOf(anna), 0);
    }

    function testFuzz_swapPaysTheQuoteToTheCaller(bool usdcIn, uint256 amountIn) public {
        (IERC20 tokenIn, IERC20 tokenOut) = usdcIn ? (IERC20(usdc), IERC20(weth)) : (IERC20(weth), IERC20(usdc));
        uint256 reserveIn = tokenIn.balanceOf(address(pool));
        uint256 reserveOut = tokenOut.balanceOf(address(pool));
        amountIn = bound(amountIn, 1, reserveIn * 10);
        deal(address(tokenIn), anna, amountIn);
        uint256 quoted = pool.quote(address(tokenIn), amountIn);

        vm.startPrank(anna);
        tokenIn.approve(address(pool), amountIn);
        vm.expectEmit(address(pool));
        emit TestPool.Swap(anna, address(tokenIn), amountIn, address(tokenOut), quoted);
        assertEq(pool.swap(address(tokenIn), amountIn, quoted), quoted);
        vm.stopPrank();

        assertEq(tokenOut.balanceOf(anna), quoted);
        assertEq(tokenIn.balanceOf(anna), 0);
        assertEq(tokenIn.balanceOf(address(pool)), reserveIn + amountIn);
        assertEq(tokenOut.balanceOf(address(pool)), reserveOut - quoted);
        assertGe((reserveIn + amountIn) * (reserveOut - quoted), reserveIn * reserveOut, "k never shrinks");
    }
}
