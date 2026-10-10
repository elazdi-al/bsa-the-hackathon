import { encodeFunctionData } from "viem";
import * as z from "zod";
import { accountAbi } from "@/lib/wallet/account.ts";
import { store } from "@/lib/wallet/api/db.ts";
import { HttpError, parse, route } from "@/lib/wallet/api/http.ts";
import { bindShares, prepare } from "@/lib/wallet/api/operations.ts";
import { chainNow, pendingRecovery } from "@/lib/wallet/env.ts";
import { address, signature } from "@/lib/wallet/schema.ts";

const body = z.object({
  recoveryKey: address,
  signer: address,
  signature,
  // MOCKED: the ID document scan and liveness selfie Swissquote matches against its KYC record.
  identity: z.object({ document: z.string().min(1), selfie: z.string().min(1) }),
});

/**
 * Lost phone, step one. The new phone split a new key with Swissquote and the partner and bound it
 * to the same recovery key; this prepares the operation that hands the wallet to that key.
 * The recovery key signs it next.
 */
export const POST = route(async (request: Request) => {
  const input = await parse(request, body);
  const wallet = store().walletByRecoveryKey(input.recoveryKey);
  if (!wallet) throw new HttpError(404, "No wallet uses this recovery key.");
  if (await pendingRecovery(wallet.address)) throw new HttpError(409, "A recovery is already pending.");
  const b = await bindShares(input.signer, input.recoveryKey, input.signature);
  const callData = encodeFunctionData({ abi: accountAbi, functionName: "initiateRecovery", args: [input.signer, b.passkey] });
  return Response.json({ address: wallet.address, ...(await prepare(wallet, "recovery", callData)) });
});

/**
 * The wallet a recovery key restores and any recovery it already has pending, so the holder of the key
 * can cancel one they didn't start before going further. The key's address is public on-chain anyway.
 */
export const GET = route(async (request: Request) => {
  const recoveryKey = address.parse(new URL(request.url).searchParams.get("recoveryKey"));
  const wallet = store().walletByRecoveryKey(recoveryKey);
  if (!wallet) throw new HttpError(404, "No wallet uses this recovery key.");
  const [pending, chainTime] = await Promise.all([pendingRecovery(wallet.address), chainNow()]);
  return Response.json({ address: wallet.address, pendingRecovery: pending && { executeAfter: pending.executeAfter }, chainTime });
});
