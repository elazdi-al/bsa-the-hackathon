import { isAddressEqual, recoverMessageAddress } from "viem";
import * as z from "zod";
import { ownershipMessage } from "@/lib/wallet/account.ts";
import { store } from "@/lib/wallet/api/db.ts";
import { HttpError, parse, route } from "@/lib/wallet/api/http.ts";
import { bindShares, predictAddress, walletConfig } from "@/lib/wallet/api/operations.ts";
import { address, signature } from "@/lib/wallet/schema.ts";

const body = z.object({ signer: address, recoveryKey: address, signature, session: z.string(), ownership: signature });

/**
 * Registers a wallet for the signed-in client once Swissquote holds Share B and the partner Share C of its
 * key, both bound by the key itself to the recovery key. Its address is fixed by its config. The key also
 * signed that the wallet belongs to the client, which Swissquote keeps as the wallet's ownership proof.
 */
export const POST = route(async (request: Request) => {
  const { signer, recoveryKey, signature: binding, session, ownership } = await parse(request, body);
  const client = store().clientBySession(session);
  if (!client) throw new HttpError(401, "Sign in to Swissquote first.");
  const b = await bindShares(signer, recoveryKey, binding);
  const config = walletConfig(signer, b.passkey, recoveryKey);
  const wallet = { address: await predictAddress(config), config };
  const by = await recoverMessageAddress({ message: ownershipMessage(client.number, wallet.address), signature: ownership }).catch(() => undefined);
  if (!by || !isAddressEqual(by, signer)) throw new HttpError(403, "The wallet key did not sign that this wallet is the client's.");
  store().addWallet(wallet, { client: client.number, signature: ownership });
  if (store().owner(wallet.address)!.client !== client.number) throw new HttpError(409, "This wallet belongs to another Swissquote client.");
  return Response.json(wallet);
});

/** The address a wallet key and recovery key will register at, so the key can sign the ownership statement first. */
export const GET = route(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const signer = address.parse(params.get("signer"));
  const b = store().shares.get(signer);
  if (!b) throw new HttpError(404, "Swissquote holds no share of that key.");
  return Response.json({ address: await predictAddress(walletConfig(signer, b.passkey, address.parse(params.get("recoveryKey")))) });
});
