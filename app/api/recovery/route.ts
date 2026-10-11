import { encodeFunctionData, recoverMessageAddress } from "viem";
import * as z from "zod";
import { accountAbi, findWalletMessage } from "@/lib/wallet/account.ts";
import { checkIdentity, sessionFor } from "@/lib/wallet/api/clients.ts";
import { store } from "@/lib/wallet/api/db.ts";
import { HttpError, parse, route } from "@/lib/wallet/api/http.ts";
import { bindShares, prepare } from "@/lib/wallet/api/operations.ts";
import { chainNow, pendingRecovery } from "@/lib/wallet/env.ts";
import { address, identity, signature } from "@/lib/wallet/schema.ts";

const body = z.object({ recoveryKey: address, signer: address, signature, identity: identity.optional() });
const LOOKUP_TTL = 300;

/**
 * Lost phone, step one. For a wallet linked to a Swissquote client, the ID check must match that client's KYC record,
 * and passing it signs this phone in to Swissquote as them. An unlinked wallet has no ID to check: its Recovery Key,
 * the 48-hour hold and the cancel protect it. The new phone split a new key with Swissquote and the partner and bound
 * it to the same recovery key; this prepares the operation that hands the wallet to that key. The recovery key signs it next.
 */
export const POST = route(async (request: Request) => {
  const input = await parse(request, body);
  const wallet = store().walletByRecoveryKey(input.recoveryKey);
  if (!wallet) throw new HttpError(404, "No wallet uses this recovery key.");
  const linked = !!store().owner(wallet.address);
  if (linked && !input.identity) throw new HttpError(403, "This wallet is linked to a Swissquote client, so Swissquote checks their ID first.", { refused: "identity" });
  const client = linked ? checkIdentity(wallet.address, input.identity!) : undefined;
  if (await pendingRecovery(wallet.address)) throw new HttpError(409, "A recovery is already pending.");
  const b = await bindShares(input.signer, input.recoveryKey, input.signature);
  const callData = encodeFunctionData({ abi: accountAbi, functionName: "initiateRecovery", args: [input.signer, b.passkey] });
  return Response.json({ address: wallet.address, ...(await prepare(wallet, "recovery", callData)), ...(client && { signedIn: sessionFor(client) }) });
});

/**
 * The wallet the signing recovery key restores, any recovery it already has pending, so the key's holder can
 * cancel one they didn't start before going further, and whether it is linked to a Swissquote client, so the ID
 * check runs. Nothing about that client: the key alone must not pass the ID check, nor learn whose ID to forge.
 */
export const GET = route(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const at = Number(params.get("at"));
  if (!(Math.abs(Date.now() / 1000 - at) < LOOKUP_TTL)) throw new HttpError(400, "This lookup expired. Try again.");
  const recoveryKey = await recoverMessageAddress({ message: findWalletMessage(at), signature: signature.parse(params.get("signature")) }).catch(() => {
    throw new HttpError(400, "That is not a Recovery Key's signature.");
  });
  const wallet = store().walletByRecoveryKey(recoveryKey);
  if (!wallet) throw new HttpError(404, "No wallet uses this recovery key.");
  const [pending, chainTime] = await Promise.all([pendingRecovery(wallet.address), chainNow()]);
  return Response.json({
    address: wallet.address,
    pendingRecovery: pending && { executeAfter: pending.executeAfter },
    chainTime,
    linked: !!store().owner(wallet.address),
  });
});
