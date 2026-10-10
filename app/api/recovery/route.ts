import { encodeFunctionData } from "viem";
import * as z from "zod";
import { accountAbi } from "@/lib/wallet/account.ts";
import { store } from "@/lib/wallet/api/db.ts";
import { address, HttpError, parse, passkey, route } from "@/lib/wallet/api/http.ts";
import { prepare } from "@/lib/wallet/api/operations.ts";
import { partnerUrl } from "@/lib/wallet/env.ts";

const body = z.object({
  recoveryKey: address,
  signer: address,
  passkey,
  // MOCKED: the ID document scan and liveness selfie Swissquote matches against its KYC record.
  identity: z.object({ document: z.string().min(1), selfie: z.string().min(1) }),
});

/**
 * Lost phone, step one. The new phone has split a new key with Swissquote and the partner;
 * this prepares the operation that hands the wallet to it. The recovery key signs it next.
 */
export const POST = route(async (request: Request) => {
  const input = await parse(request, body);
  const wallet = store().walletByRecoveryKey(input.recoveryKey);
  if (!wallet) throw new HttpError(404, "No wallet uses this recovery key.");
  const b = store().shares.get(input.signer);
  const c = await fetch(`${partnerUrl}/shares/${input.signer}`).then((res) => (res.ok ? res.json() : undefined), () => undefined);
  if (b?.passkey.x !== input.passkey.x || b.passkey.y !== input.passkey.y || c?.passkey.x !== input.passkey.x || c?.passkey.y !== input.passkey.y) {
    throw new HttpError(409, "Split the new key with Swissquote and the independent service first.");
  }
  const callData = encodeFunctionData({ abi: accountAbi, functionName: "initiateRecovery", args: [input.signer, input.passkey] });
  return Response.json({ address: wallet.address, ...(await prepare(wallet, "recovery", callData)) });
});
