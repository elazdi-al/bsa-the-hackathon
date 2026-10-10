import * as z from "zod";
import { store } from "@/lib/wallet/api/db.ts";
import { commitments, HttpError, parse, passkey, route, share } from "@/lib/wallet/api/http.ts";
import { swissquote } from "@/lib/wallet/api/operations.ts";
import { chain, partnerUrl } from "@/lib/wallet/env.ts";
import { HOLDERS, signerOf, verifyShare } from "@/lib/wallet/shamir.ts";
import { signTicket } from "@/lib/wallet/tickets.ts";

const body = z.object({ commitments, passkey, share: share(HOLDERS.swissquote) });

/**
 * Stores Share B of a key the phone just split, after checking it against the key's commitments,
 * and tickets the partner to store Share C, which the phone sends there directly.
 */
export const POST = route(async (request: Request) => {
  const input = await parse(request, body);
  if (!verifyShare(input.share, input.commitments)) throw new HttpError(400, "That share does not belong to this key.");
  const signer = signerOf(input.commitments);
  const shares = store().shares;
  if (!shares.get(signer)) shares.put({ signer, passkey: input.passkey, share: input.share });
  const ticket = await signTicket(swissquote(), chain.id, "Shares", {
    signer,
    passkeyX: input.passkey.x,
    passkeyY: input.passkey.y,
    keyCommitment: input.commitments[0],
    slopeCommitment: input.commitments[1],
  });
  return Response.json({ signer, ticket, partnerUrl });
});
