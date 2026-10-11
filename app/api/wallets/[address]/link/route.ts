import type { Address } from "viem";
import * as z from "zod";
import { ownershipChallenge, ownershipMessage } from "@/lib/wallet/account.ts";
import { sessionFor } from "@/lib/wallet/api/clients.ts";
import { store } from "@/lib/wallet/api/db.ts";
import { HttpError, parse, route, rpId, verifyAssertion } from "@/lib/wallet/api/http.ts";
import { refuseLocked } from "@/lib/wallet/api/locks.ts";
import { liveCredentials, requireWallet } from "@/lib/wallet/api/operations.ts";
import { assertion } from "@/lib/wallet/schema.ts";

const body = z.object({ session: z.string(), assertion });

/**
 * Links a wallet to the client signed in with `session`: the wallet's passkey, with Face ID, signs that the wallet
 * belongs to them, as it approves every payment. Swissquote keeps the statement and the assertion as its ownership
 * proof. From then on Swissquote pays the wallet's gas and can lock its phone. Once linked, a wallet stays with its client.
 */
export const POST = route(async (request: Request, ctx: RouteContext<"/api/wallets/[address]/link">) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const input = await parse(request, body);
  const client = store().clientBySession(input.session);
  if (!client) throw new HttpError(401, "Sign in to Swissquote first.");
  const live = await liveCredentials(wallet);
  // A phone reported lost links nothing: linking it again would sign whoever holds it in as the wallet's owner.
  await refuseLocked(wallet, live);
  if (!verifyAssertion(input.assertion, ownershipChallenge(client.number, wallet.address), live.passkey, rpId(request))) {
    throw new HttpError(403, "The wallet's passkey did not confirm that this wallet is the client's.");
  }
  const owner = store().link(wallet.address, { client: client.number, assertion: input.assertion });
  // MOCKED: a client signs in to their own Swissquote account to link. The mock signed this phone in as a new, made-up
  // client; when the passkey just proved, with Face ID, that this phone holds a wallet another client linked, as after
  // a recovery, it signs the phone in as that owner instead.
  const signedIn = owner.client === client.number ? undefined : sessionFor(store().client(owner.client)!);
  return Response.json({
    client: owner.client,
    createdAt: owner.createdAt,
    statement: ownershipMessage(owner.client, wallet.address),
    assertion: owner.assertion,
    ...(signedIn && { signedIn }),
  });
});
