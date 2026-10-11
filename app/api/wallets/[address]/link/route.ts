import { isAddressEqual, recoverMessageAddress, type Address } from "viem";
import * as z from "zod";
import { ownershipMessage } from "@/lib/wallet/account.ts";
import { store } from "@/lib/wallet/api/db.ts";
import { HttpError, parse, route } from "@/lib/wallet/api/http.ts";
import { liveCredentials, requireWallet } from "@/lib/wallet/api/operations.ts";
import { signature } from "@/lib/wallet/schema.ts";

const body = z.object({ session: z.string(), signature });

/**
 * Links a wallet to the client signed in with `session`: the wallet key signs that the wallet belongs to them, which
 * Swissquote keeps as its ownership proof. From then on, a recovery of the wallet and a lock of its phone check
 * the client's ID. Once linked, a wallet stays with its client.
 */
export const POST = route(async (request: Request, ctx: RouteContext<"/api/wallets/[address]/link">) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const input = await parse(request, body);
  const client = store().clientBySession(input.session);
  if (!client) throw new HttpError(401, "Sign in to Swissquote first.");
  const { signer } = await liveCredentials(wallet);
  const message = ownershipMessage(client.number, wallet.address);
  const by = await recoverMessageAddress({ message, signature: input.signature }).catch(() => undefined);
  if (!by || !isAddressEqual(by, signer)) throw new HttpError(403, "The wallet key did not sign that this wallet is the client's.");
  const owner = store().link(wallet.address, { client: client.number, signature: input.signature });
  if (owner.client !== client.number) throw new HttpError(409, "This wallet is linked to another Swissquote client.");
  return Response.json({ client: owner.client, createdAt: owner.createdAt, statement: message, signature: owner.signature });
});
