import type { Address } from "viem";
import * as z from "zod";
import { checkIdentity } from "@/lib/wallet/api/clients.ts";
import { parse, route } from "@/lib/wallet/api/http.ts";
import { lock, unlock } from "@/lib/wallet/api/locks.ts";
import { liveCredentials, requireWallet } from "@/lib/wallet/api/operations.ts";
import { identity } from "@/lib/wallet/schema.ts";

type Context = RouteContext<"/api/wallets/[address]/lock">;
const body = z.object({ identity });

/**
 * The client reported the phone lost or stolen through the hotline or web banking, after the ID check (mocked).
 * Swissquote locks the credentials on that phone, not the wallet.
 */
export const POST = route(async (request: Request, ctx: Context) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  checkIdentity(wallet.address, (await parse(request, body)).identity);
  const live = await liveCredentials(wallet);
  lock(wallet.address, live);
  return Response.json({ wallet: wallet.address, signer: live.signer, locked: true });
});

/** Swissquote unlocks the phone, after the same ID check. Unlocking a phone that isn't locked is fine. */
export const DELETE = route(async (request: Request, ctx: Context) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  checkIdentity(wallet.address, (await parse(request, body)).identity);
  const { signer } = await liveCredentials(wallet);
  unlock(signer);
  return Response.json({ wallet: wallet.address, signer, locked: false });
});
