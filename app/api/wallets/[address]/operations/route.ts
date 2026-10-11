import type { Address } from "viem";
import * as z from "zod";
import { requestSchema } from "@/lib/compliance/schema";
import { parse, route } from "@/lib/wallet/api/http.ts";
import { assist, prepare, requireWallet } from "@/lib/wallet/api/operations.ts";
import { hex } from "@/lib/wallet/schema.ts";

/**
 * Sponsors an operation the phone built. The phone checks the returned operation against its
 * own callData, computes the hash itself and signs it with the passkey and the wallet key.
 */
export const POST = route(async (request: Request, ctx: RouteContext<"/api/wallets/[address]/operations">) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const { callData, dapp } = await parse(request, z.object({ callData: hex, dapp: requestSchema.shape.dapp }).strict());
  const assistance = await assist(wallet, callData, dapp);
  return Response.json({ ...(await prepare(wallet, "normal", callData, assistance.review?.expiresAt)), ...assistance }, { headers: { "cache-control": "no-store" } });
});
