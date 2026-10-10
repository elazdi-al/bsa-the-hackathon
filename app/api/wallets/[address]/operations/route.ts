import type { Address } from "viem";
import * as z from "zod";
import { hex, parse, route } from "@/lib/wallet/api/http.ts";
import { assist, prepare, requireWallet } from "@/lib/wallet/api/operations.ts";

/**
 * Sponsors an operation the phone built. The phone checks the returned operation against its
 * own callData, computes the hash itself and signs it with the passkey and the wallet key.
 */
export const POST = route(async (request: Request, ctx: RouteContext<"/api/wallets/[address]/operations">) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const { callData } = await parse(request, z.object({ callData: hex }));
  const summary = await assist(wallet, callData);
  return Response.json({ ...(await prepare(wallet, "normal", callData)), summary });
});
