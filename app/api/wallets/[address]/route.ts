import { erc20Abi, type Address } from "viem";
import { ownershipMessage } from "@/lib/wallet/account.ts";
import { store } from "@/lib/wallet/api/db.ts";
import { route } from "@/lib/wallet/api/http.ts";
import { liveCredentials, requireWallet } from "@/lib/wallet/api/operations.ts";
import { addresses, chainNow, isDeployed, pendingRecovery, publicClient } from "@/lib/wallet/env.ts";

export const GET = route(async (_request: Request, ctx: RouteContext<"/api/wallets/[address]">) => {
  const wallet = requireWallet((await ctx.params).address as Address);
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
    owner: owner(wallet.address),
  });
});

/** Swissquote's ownership record: the client the wallet was created for, and the wallet key's signed statement saying so. */
function owner(address: Address) {
  const record = store().owner(address);
  return record ? { client: record.client, createdAt: record.createdAt, statement: ownershipMessage(record.client, address), signature: record.signature } : null;
}
