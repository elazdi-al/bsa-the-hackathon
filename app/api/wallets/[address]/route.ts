import { erc20Abi, type Address } from "viem";
import { route } from "@/lib/wallet/api/http.ts";
import { liveCredentials, requireWallet } from "@/lib/wallet/api/operations.ts";
import { addresses, chainNow, isDeployed, pendingRecovery, publicClient } from "@/lib/wallet/env.ts";
import { poolAbi } from "@/lib/wallet/pool.ts";

export const GET = route(async (_request: Request, ctx: RouteContext<"/api/wallets/[address]">) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const deployed = isDeployed(wallet.address);
  const { weth, pool } = addresses;
  const balanceOf = (token: Address) => publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
  const [credentials, pending, usdc, eth, reserves, chainTime] = await Promise.all([
    liveCredentials(wallet, deployed),
    pendingRecovery(wallet.address, deployed),
    balanceOf(addresses.usdc),
    weth ? balanceOf(weth) : 0n,
    pool && publicClient.readContract({ address: pool, abi: poolAbi, functionName: "reserves" }),
    chainNow(),
  ]);
  return Response.json({
    address: wallet.address,
    ...credentials,
    usdc: usdc.toString(),
    eth: eth.toString(),
    pool: reserves && { usdc: reserves[0].toString(), weth: reserves[1].toString() },
    pendingRecovery: pending && { signer: pending.signer, executeAfter: pending.executeAfter },
    chainTime,
  });
});
