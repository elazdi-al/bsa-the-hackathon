import { isAddressEqual, recoverMessageAddress, type Address, type Hex } from "viem";
import * as z from "zod";
import { cancelPaymentChallenge, cancelPaymentMessage, decodeSponsorship } from "@/lib/wallet/account.ts";
import { store } from "@/lib/wallet/api/db.ts";
import { HttpError, parse, route, rpId, verifyAssertion } from "@/lib/wallet/api/http.ts";
import { refuseLocked } from "@/lib/wallet/api/locks.ts";
import { cancelHeld, hold, liveCredentials, requireWallet, submit, takeOperation } from "@/lib/wallet/api/operations.ts";
import { assertion, hex, signature as signatureSchema } from "@/lib/wallet/schema.ts";

type Context = RouteContext<"/api/wallets/[address]/operations/[hash]">;

/**
 * Submits an operation Swissquote prepared, with the signature the phone assembled; the account checks it.
 * One sponsored for later is held instead, until its release.
 */
export const POST = route(async (request: Request, ctx: Context) => {
  const params = await ctx.params;
  const { signature } = await parse(request, z.object({ signature: hex }));
  const wallet = requireWallet(params.address as Address);
  // A recovery is signed with the Recovery Key, not the phone's credentials.
  if (store().operation(params.hash as Hex, wallet.address)?.kind !== "recovery") await refuseLocked(wallet);
  const userOp = takeOperation(wallet, params.hash as Hex);
  if (decodeSponsorship(userOp.paymasterData!).validAfter) return Response.json(await hold(wallet, params.hash as Hex, { ...userOp, signature }));
  return Response.json({ transactionHash: await submit(userOp, signature) });
});

/** Cancels a held payment: the client asks with Face ID on the phone, or, without it, with the recovery key. */
export const DELETE = route(async (request: Request, ctx: Context) => {
  const params = await ctx.params;
  const hash = params.hash as Hex;
  const wallet = requireWallet(params.address as Address);
  const body = await parse(request, z.union([z.object({ assertion }), z.object({ signature: signatureSchema })]));
  const { passkey, recoveryKey } = await liveCredentials(wallet);
  const asked =
    "assertion" in body
      ? verifyAssertion(body.assertion, cancelPaymentChallenge(hash), passkey, rpId(request))
      : isAddressEqual(await recoverMessageAddress({ message: cancelPaymentMessage(wallet.address, hash), signature: body.signature }), recoveryKey);
  if (!asked) throw new HttpError(403, "Neither the wallet's passkey nor its recovery key asked for this.");
  cancelHeld(wallet, hash);
  return Response.json({ cancelled: hash });
});
