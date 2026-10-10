import * as z from "zod";
import { store } from "@/lib/wallet/api/db.ts";
import { address, HttpError, parse, route } from "@/lib/wallet/api/http.ts";
import { predictAddress, walletConfig } from "@/lib/wallet/api/operations.ts";
import { partnerUrl } from "@/lib/wallet/env.ts";

const body = z.object({ signer: address, recoveryKey: address });

/** Registers a wallet once Swissquote holds Share B and the partner Share C of its key. Its address is fixed by its config. */
export const POST = route(async (request: Request) => {
  const { signer, recoveryKey } = await parse(request, body);
  const b = store().shares.get(signer);
  if (!b) throw new HttpError(409, "Swissquote holds no share of that key.");
  const c = await fetch(`${partnerUrl}/shares/${signer}`).then((res) => (res.ok ? res.json() : undefined), () => undefined);
  if (c?.passkey.x !== b.passkey.x || c?.passkey.y !== b.passkey.y) throw new HttpError(409, "The independent service holds no share of that key.");

  const config = walletConfig(signer, b.passkey, recoveryKey);
  const wallet = { address: await predictAddress(config), config };
  if (!store().wallet(wallet.address)) store().addWallet(wallet);
  return Response.json(wallet);
});
