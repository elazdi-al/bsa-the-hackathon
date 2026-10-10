import type { Address, Hex } from "viem";
import * as z from "zod";
import { parse, route } from "@/lib/wallet/api/http.ts";
import { loadOperation, requireWallet, submit } from "@/lib/wallet/api/operations.ts";
import { hex } from "@/lib/wallet/schema.ts";

/** Submits an operation with the signature the phone assembled: the wallet key's plus the passkey's. */
export const POST = route(async (request: Request, ctx: RouteContext<"/api/wallets/[address]/operations/[hash]">) => {
  const params = await ctx.params;
  const userOp = loadOperation(requireWallet(params.address as Address), params.hash as Hex, "normal");
  const { signature } = await parse(request, z.object({ signature: hex }));
  return Response.json({ transactionHash: await submit(userOp, signature) });
});
