import { erc20Abi, type Address } from "viem";
import { route } from "@/lib/wallet/api/http.ts";
import { heldPayments, liveCredentials, releaseDue, requireWallet } from "@/lib/wallet/api/operations.ts";
import { addresses, chainNow, isDeployed, pendingRecovery, publicClient } from "@/lib/wallet/env.ts";

export const GET = route(async (_request: Request, ctx: RouteContext<"/api/wallets/[address]">) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  // Swissquote reads the wallet every few seconds while the app is open: payments due leave first, so the balance shows them gone.
  await releaseDue(wallet);
  const deployed = isDeployed(wallet.address);
  const [credentials, pending, usdc, chainTime] = await Promise.all([
    liveCredentials(wallet, deployed),
    pendingRecovery(wallet.address, deployed),
    publicClient.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] }),
    chainNow(),
  ]);
  return Response.json({
    address: wallet.address,
    ...credentials,
    usdc: usdc.toString(),
    pendingRecovery: pending && { signer: pending.signer, executeAfter: pending.executeAfter },
    chainTime,
    held: heldPayments(wallet),
  });
});
