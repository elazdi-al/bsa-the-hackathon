import { erc20Abi, type Address } from "viem";
import { ownershipMessage } from "@/lib/wallet/account.ts";
import { store } from "@/lib/wallet/api/db.ts";
import { route } from "@/lib/wallet/api/http.ts";
import { lockOn } from "@/lib/wallet/api/locks.ts";
import { liveCredentials, requireWallet } from "@/lib/wallet/api/operations.ts";
import { addresses, chainNow, isDeployed, pendingRecovery, publicClient } from "@/lib/wallet/env.ts";

export const GET = route(async (request: Request, ctx: RouteContext<"/api/wallets/[address]">) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const deployed = isDeployed(wallet.address);
  const owned = owner(wallet.address, request.headers.get("x-swissquote-session"));
  const [credentials, pending, usdc, eth, chainTime] = await Promise.all([
    liveCredentials(wallet, deployed),
    pendingRecovery(wallet.address, deployed),
    publicClient.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] }),
    publicClient.getBalance({ address: wallet.address }),
    chainNow(),
  ]);
  return Response.json({
    address: wallet.address,
    ...credentials,
    locked: !!(await lockOn(wallet, credentials)),
    usdc: usdc.toString(),
    eth: eth.toString(),
    pendingRecovery: pending && { signer: pending.signer, executeAfter: pending.executeAfter },
    chainTime,
    owner: owned,
    plus: owned && plusOf(owned.client, chainTime),
  });
});

/**
 * Swissquote's ownership record: the client who linked the wallet, the statement saying so, and the wallet passkey's
 * assertion over it.
 * Only for that client, signed in on the phone asking: the wallet is public, who owns it is bank secrecy.
 */
function owner(address: Address, session: string | null) {
  const record = store().owner(address);
  const client = session ? store().clientBySession(session) : undefined;
  if (!record || !client || record.client !== client.number) return undefined;
  return { client: record.client, createdAt: record.createdAt, statement: ownershipMessage(record.client, address), assertion: record.assertion };
}

/** The client's Swissquote Plus while it runs. Plus is the client's, so it is told only where the owner is. */
function plusOf(client: string, now: number) {
  const until = store().plusUntil(client);
  return until !== undefined && until > now ? { until } : undefined;
}
