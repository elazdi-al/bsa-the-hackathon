import { isAddressEqual, recoverMessageAddress, type Address } from "viem";
import * as z from "zod";
import { lockPhoneMessage } from "@/lib/wallet/account.ts";
import { store } from "@/lib/wallet/api/db.ts";
import { HttpError, parse, route } from "@/lib/wallet/api/http.ts";
import { lock, unlock } from "@/lib/wallet/api/locks.ts";
import { liveCredentials, requireWallet } from "@/lib/wallet/api/operations.ts";
import { signature } from "@/lib/wallet/schema.ts";

type Context = RouteContext<"/api/wallets/[address]/lock">;
const body = z.object({ at: z.number().int(), signature });
const TTL = 300;

/**
 * The wallet and its live credentials, once its Recovery Key signed the request and Swissquote found the wallet linked
 * to a client: only a linked wallet's phone can be locked. The key is checked first, so no one else learns whether
 * the wallet is linked.
 */
async function authorize(request: Request, ctx: Context, locked: boolean) {
  const wallet = requireWallet((await ctx.params).address as Address);
  const { at, signature } = await parse(request, body);
  if (!(Math.abs(Date.now() / 1000 - at) < TTL)) throw new HttpError(400, "This request expired. Try again.");
  const live = await liveCredentials(wallet);
  const by = await recoverMessageAddress({ message: lockPhoneMessage(wallet.address, locked, at), signature }).catch(() => undefined);
  if (!by || !isAddressEqual(by, live.recoveryKey)) throw new HttpError(403, "The recovery key did not ask for this.");
  if (!store().owner(wallet.address)) throw new HttpError(403, "This wallet isn't linked to a Swissquote client, so Swissquote can't lock or unlock its phone.", { refused: "unlinked" });
  return { wallet, live };
}

/**
 * The client reported the phone lost or stolen, with their Recovery Key: Swissquote locks the credentials on that
 * phone, not the wallet. Nothing changes on-chain.
 */
export const POST = route(async (request: Request, ctx: Context) => {
  const { wallet, live } = await authorize(request, ctx, true);
  lock(wallet.address, live);
  return Response.json({ wallet: wallet.address, signer: live.signer, locked: true });
});

/** Swissquote unlocks the phone, asked the same way. Unlocking a phone that isn't locked is fine. */
export const DELETE = route(async (request: Request, ctx: Context) => {
  const { wallet, live } = await authorize(request, ctx, false);
  unlock(live.signer);
  return Response.json({ wallet: wallet.address, signer: live.signer, locked: false });
});
