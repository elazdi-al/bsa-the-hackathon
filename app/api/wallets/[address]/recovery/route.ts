import { isAddressEqual, recoverAddress, recoverMessageAddress, type Address } from "viem";
import * as z from "zod";
import { cancelRecoveryMessage } from "@/lib/wallet/account.ts";
import { store } from "@/lib/wallet/api/db.ts";
import { HttpError, parse, route } from "@/lib/wallet/api/http.ts";
import { callAccount, liveCredentials, loadOperation, requireWallet, swissquote } from "@/lib/wallet/api/operations.ts";
import { chain, pendingRecovery } from "@/lib/wallet/env.ts";
import { bytes32, signature as signatureSchema } from "@/lib/wallet/schema.ts";
import { signTicket } from "@/lib/wallet/tickets.ts";

type Context = RouteContext<"/api/wallets/[address]/recovery">;

/**
 * Swissquote's half of authorizing a recovery: once the wallet's recovery key signed the prepared
 * operation, it releases Share B to the new phone with an approval the partner checks before it
 * releases Share C. The phone rebuilds the old key itself and submits the signed operation.
 */
export const POST = route(async (request: Request, ctx: Context) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const { hash, signature } = await parse(request, z.object({ hash: bytes32, signature: signatureSchema }));
  loadOperation(wallet, hash, "recovery");
  const { signer } = await liveCredentials(wallet);
  const b = store().shares.get(signer);
  if (!b?.recoveryKey || !isAddressEqual(await recoverAddress({ hash, signature }), b.recoveryKey)) {
    throw new HttpError(403, "The wallet's recovery key did not sign this operation.");
  }
  if (await pendingRecovery(wallet.address)) throw new HttpError(409, "A recovery is already pending.");
  const approval = await signTicket(swissquote(), chain.id, "RecoveryApproval", { wallet: wallet.address, userOpHash: hash });
  return Response.json({ share: b.share, signer, approval });
});

/** Swissquote cancels the pending recovery for the client, as the wallet's guardian. */
export const DELETE = route(async (request: Request, ctx: Context) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const { signature } = await parse(request, z.object({ signature: signatureSchema }));
  const pending = await pendingRecovery(wallet.address);
  if (!pending) throw new HttpError(409, "There is no recovery to cancel.");
  const { recoveryKey } = await liveCredentials(wallet);
  const by = await recoverMessageAddress({ message: cancelRecoveryMessage(wallet.address, pending.executeAfter), signature });
  if (!isAddressEqual(by, recoveryKey)) throw new HttpError(403, "The recovery key did not ask for this.");
  return Response.json({ transactionHash: await callAccount(wallet.address, "cancelRecovery") });
});

/** Finalizes once the hold has passed. Anyone may; Swissquote pays the gas. */
export const PATCH = route(async (_request: Request, ctx: Context) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  return Response.json({ transactionHash: await callAccount(wallet.address, "finalizeRecovery") });
});
