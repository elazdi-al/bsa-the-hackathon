// The deployment's USDC/WETH test pool (contracts/script/TestPool.sol): its ABI and its exact pricing, shared by
// the phone, the app's swap sheet, the Wallet API and the scripts. A deployment made before the pool has none.
import { formatUnits, parseAbi } from "viem";

export const poolAbi = parseAbi([
  "function usdc() view returns (address)",
  "function weth() view returns (address)",
  "function reserves() view returns (uint256 usdcReserve, uint256 wethReserve)",
  "function quote(address tokenIn, uint256 amountIn) view returns (uint256 amountOut)",
  "function swap(address tokenIn, uint256 amountIn, uint256 minAmountOut) returns (uint256 amountOut)",
  "event Swap(address indexed account, address indexed tokenIn, uint256 amountIn, address indexed tokenOut, uint256 amountOut)",
  "error Slippage(uint256 amountOut, uint256 minAmountOut)",
  "error UnknownToken()",
]);

export type PoolToken = "usdc" | "weth";
/** The pool's balances, in base units. */
export type Reserves = Record<PoolToken, bigint>;

export const DECIMALS: Record<PoolToken, number> = { usdc: 6, weth: 18 };
export const other = (token: PoolToken): PoolToken => (token === "usdc" ? "weth" : "usdc");

/** The pool's own `quote`: what `amountIn` of `tokenIn` buys after the 0.3% fee, rounded down like the contract. */
export function quoteOut(reserves: Reserves, tokenIn: PoolToken, amountIn: bigint): bigint {
  const reserveIn = reserves[tokenIn];
  const reserveOut = reserves[other(tokenIn)];
  return (reserveOut * amountIn * 997n) / (reserveIn * 1000n + amountIn * 997n);
}

/** The least a swap accepts, 0.5% under its quote; less and the pool reverts with Slippage. */
export const minOut = (quote: bigint) => (quote * 995n) / 1000n;

/** Dollars per ETH at the pool's mid price. */
export const ethPrice = (reserves: Reserves) => Number(formatUnits(reserves.usdc, 6)) / Number(formatUnits(reserves.weth, 18));
