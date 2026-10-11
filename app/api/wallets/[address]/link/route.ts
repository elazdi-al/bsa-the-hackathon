import type { Address } from "viem";
import * as z from "zod";
import { ownershipChallenge, ownershipMessage } from "@/lib/wallet/account.ts";
import { store } from "@/lib/wallet/api/db.ts";
import { HttpError, parse, route, rpId, verifyAssertion } from "@/lib/wallet/api/http.ts";
import { liveCredentials, requireWallet } from "@/lib/wallet/api/operations.ts";
import { assertion } from "@/lib/wallet/schema.ts";

const body = z.object({ session: z.string(), assertion });

/**
 * Links a wallet to the client signed in with `session`: the wallet's passkey, with Face ID, signs that the wallet
 * belongs to them, as it approves every payment. Swissquote keeps the statement and the assertion as its ownership
 * proof. From then on, a recovery of the wallet and a lock of its phone check the client's ID. Once linked, a wallet
 * stays with its client.
 */
export const POST = route(async (request: Request, ctx: RouteContext<"/api/wallets/[address]/link">) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const input = await parse(request, body);
  const client = store().clientBySession(input.session);
  if (!client) throw new HttpError(401, "Sign in to Swissquote first.");
  const { passkey } = await liveCredentials(wallet);
  if (!verifyAssertion(input.assertion, ownershipChallenge(client.number, wallet.address), passkey, rpId(request))) {
    throw new HttpError(403, "The wallet's passkey did not confirm that this wallet is the client's.");
  }
  const owner = store().link(wallet.address, { client: client.number, assertion: input.assertion });
  if (owner.client !== client.number) throw new HttpError(409, "This wallet is linked to another Swissquote client.");
  return Response.json({ client: owner.client, createdAt: owner.createdAt, statement: ownershipMessage(owner.client, wallet.address), assertion: owner.assertion });
});
