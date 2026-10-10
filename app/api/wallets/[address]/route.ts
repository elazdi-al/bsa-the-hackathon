import { erc20Abi, type Address } from "viem";
import { route } from "@/lib/wallet/api/http.ts";
import { liveCredentials, requireWallet } from "@/lib/wallet/api/operations.ts";
import { addresses, pendingRecovery, publicClient } from "@/lib/wallet/env.ts";

export const GET = route(async (_request: Request, ctx: RouteContext<"/api/wallets/[address]">) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const [credentials, pending, usdc] = await Promise.all([
    liveCredentials(wallet),
    pendingRecovery(wallet.address),
    publicClient.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] }),
  ]);
  return Response.json({
    address: wallet.address,
    ...credentials,
    usdc: usdc.toString(),
    pendingRecovery: pending && { signer: pending.signer, executeAfter: pending.executeAfter },
  });
});
