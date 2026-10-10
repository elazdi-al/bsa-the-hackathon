import { isAddressEqual, recoverAddress, recoverMessageAddress, type Address, type Hex } from "viem";
import * as z from "zod";
import { cancelRecoveryMessage, encodeRecoverySignature } from "@/lib/wallet/account.ts";
import { bytes32, hex, HttpError, parse, route } from "@/lib/wallet/api/http.ts";
import { callAccount, liveCredentials, loadOperation, requireWallet, signRecovery, submit } from "@/lib/wallet/api/operations.ts";
import { pendingRecovery } from "@/lib/wallet/env.ts";

type Context = RouteContext<"/api/wallets/[address]/recovery">;

/** Starts the recovery: the recovery key signed the operation, Swissquote and the partner add the wallet key's signature. */
export const POST = route(async (request: Request, ctx: Context) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const { hash, signature } = await parse(request, z.object({ hash: bytes32, signature: hex }));
  const userOp = loadOperation(wallet, hash, "recovery");
  const { recoveryKey } = await liveCredentials(wallet);
  if (!isAddressEqual(await recoverAddress({ hash, signature }), recoveryKey)) throw new HttpError(403, "The recovery key did not sign this operation.");
  const transactionHash = await submit(userOp, encodeRecoverySignature(await signRecovery(wallet, hash, userOp, signature), signature));
  return Response.json({ transactionHash, executeAfter: (await pendingRecovery(wallet.address))?.executeAfter });
});

/** Swissquote cancels the pending recovery for the client, as the wallet's guardian. */
export const DELETE = route(async (request: Request, ctx: Context) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const { signature } = await parse(request, z.object({ signature: hex }));
  const pending = await pendingRecovery(wallet.address);
  if (!pending) throw new HttpError(409, "There is no recovery to cancel.");
  const { recoveryKey } = await liveCredentials(wallet);
  const signer = await recoverMessageAddress({ message: cancelRecoveryMessage(wallet.address, pending.executeAfter), signature: signature as Hex });
  if (!isAddressEqual(signer, recoveryKey)) throw new HttpError(403, "The recovery key did not ask for this.");
  return Response.json({ transactionHash: await callAccount(wallet.address, "cancelRecovery") });
});

/** Finalizes once the 48 hours have passed. Anyone may; Swissquote pays the gas. */
export const PATCH = route(async (_request: Request, ctx: Context) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  return Response.json({ transactionHash: await callAccount(wallet.address, "finalizeRecovery") });
});
