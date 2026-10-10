import type { Address } from "viem";
import * as z from "zod";
import { store } from "@/lib/wallet/api/db.ts";
import { HttpError, parse, route, verifyAssertion } from "@/lib/wallet/api/http.ts";
import { liveCredentials, loadOperation, requireWallet } from "@/lib/wallet/api/operations.ts";
import { assertion, bytes32 } from "@/lib/wallet/schema.ts";

/**
 * Lends Share B to the phone so it can rebuild the wallet key. The phone proves itself with the
 * same Face ID assertion that approves the operation it is about to sign, so it costs no extra prompt.
 */
export const POST = route(async (request: Request, ctx: RouteContext<"/api/wallets/[address]/share">) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const input = await parse(request, z.object({ hash: bytes32, assertion }));
  loadOperation(wallet, input.hash, "normal");
  const { signer, passkey } = await liveCredentials(wallet);
  if (!verifyAssertion(input.assertion, input.hash, passkey, new URL(request.url).hostname)) {
    throw new HttpError(403, "This passkey did not approve the operation.");
  }
  const b = store().shares.get(signer);
  if (!b) throw new HttpError(500, "Swissquote holds no Share B for this wallet's key.");
  return Response.json({ share: b.share });
});
