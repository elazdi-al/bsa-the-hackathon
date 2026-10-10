import * as z from "zod";
import { store } from "@/lib/wallet/api/db.ts";
import { parse, route } from "@/lib/wallet/api/http.ts";
import { bindShares, predictAddress, walletConfig, welcome } from "@/lib/wallet/api/operations.ts";
import { address, signature } from "@/lib/wallet/schema.ts";

const body = z.object({ signer: address, recoveryKey: address, signature });

/**
 * Registers a wallet once Swissquote holds Share B and the partner Share C of its key, both bound
 * by the key itself to the recovery key. Its address is fixed by its config.
 */
export const POST = route(async (request: Request) => {
  const { signer, recoveryKey, signature: binding } = await parse(request, body);
  const b = await bindShares(signer, recoveryKey, binding);
  const config = walletConfig(signer, b.passkey, recoveryKey);
  const wallet = { address: await predictAddress(config), config };
  if (!store().wallet(wallet.address)) {
    store().addWallet(wallet);
    // The wallet exists either way; a failed gift only leaves it empty.
    await welcome(wallet.address).catch((error) => console.warn(`no welcome USDC for ${wallet.address}: ${error.message}`));
  }
  return Response.json(wallet);
});
