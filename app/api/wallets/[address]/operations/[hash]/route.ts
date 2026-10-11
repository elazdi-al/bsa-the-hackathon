import type { Address, Hex } from "viem";
import * as z from "zod";
import { store } from "@/lib/wallet/api/db.ts";
import { parse, route } from "@/lib/wallet/api/http.ts";
import { refuseLocked } from "@/lib/wallet/api/locks.ts";
import { requireWallet, submit, takeOperation } from "@/lib/wallet/api/operations.ts";
import { hex } from "@/lib/wallet/schema.ts";

type Context = RouteContext<"/api/wallets/[address]/operations/[hash]">;

/** Submits an operation Swissquote prepared, with the signature the phone assembled; the account checks it. */
export const POST = route(async (request: Request, ctx: Context) => {
  const params = await ctx.params;
  const { signature } = await parse(request, z.object({ signature: hex }));
  const wallet = requireWallet(params.address as Address);
  // A recovery is signed with the Recovery Key, not the phone's credentials.
  if (store().operation(params.hash as Hex, wallet.address)?.kind !== "recovery") await refuseLocked(wallet);
  const userOp = takeOperation(wallet, params.hash as Hex);
  return Response.json({ transactionHash: await submit(userOp, signature) });
});
