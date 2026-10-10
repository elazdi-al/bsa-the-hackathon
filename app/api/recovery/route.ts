import { encodeFunctionData, recoverMessageAddress } from "viem";
import * as z from "zod";
import { accountAbi, findWalletMessage } from "@/lib/wallet/account.ts";
import { checkIdentity, idOnFile, sessionFor } from "@/lib/wallet/api/clients.ts";
import { store } from "@/lib/wallet/api/db.ts";
import { HttpError, parse, route } from "@/lib/wallet/api/http.ts";
import { bindShares, prepare } from "@/lib/wallet/api/operations.ts";
import { chainNow, pendingRecovery } from "@/lib/wallet/env.ts";
import { address, identity, signature } from "@/lib/wallet/schema.ts";

const body = z.object({ recoveryKey: address, signer: address, signature, identity });

/**
 * Lost phone, step one. The ID check must match the KYC record of the client the wallet belongs to; passing
 * it signs this phone in to Swissquote as that client. The new phone split a new key with Swissquote and the
 * partner and bound it to the same recovery key; this prepares the operation that hands the wallet to that key.
 * The recovery key signs it next.
 */
export const POST = route(async (request: Request) => {
  const input = await parse(request, body);
  const wallet = store().walletByRecoveryKey(input.recoveryKey);
  if (!wallet) throw new HttpError(404, "No wallet uses this recovery key.");
  const client = checkIdentity(wallet.address, input.identity);
  if (await pendingRecovery(wallet.address)) throw new HttpError(409, "A recovery is already pending.");
  const b = await bindShares(input.signer, input.recoveryKey, input.signature);
  const callData = encodeFunctionData({ abi: accountAbi, functionName: "initiateRecovery", args: [input.signer, b.passkey] });
  return Response.json({ address: wallet.address, ...(await prepare(wallet, "recovery", callData)), signedIn: sessionFor(client) });
});

/**
 * The wallet the signing recovery key restores, any recovery it already has pending, so the key's holder can
 * cancel one they didn't start before going further, and the ID its owner has on file (mocked).
 */
export const GET = route(async (request: Request) => {
  const recoveryKey = await recoverMessageAddress({
    message: findWalletMessage,
    signature: signature.parse(new URL(request.url).searchParams.get("signature")),
  });
  const wallet = store().walletByRecoveryKey(recoveryKey);
  if (!wallet) throw new HttpError(404, "No wallet uses this recovery key.");
  const [pending, chainTime] = await Promise.all([pendingRecovery(wallet.address), chainNow()]);
  return Response.json({
    address: wallet.address,
    pendingRecovery: pending && { executeAfter: pending.executeAfter },
    chainTime,
    idOnFile: idOnFile(wallet.address),
  });
});
