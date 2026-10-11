import type { Address } from "viem";
import * as z from "zod";
import { requestSchema } from "@/lib/compliance/schema";
import { parse, route } from "@/lib/wallet/api/http.ts";
import { assist, prepare, requireSponsorable, requireWallet } from "@/lib/wallet/api/operations.ts";
import { hex } from "@/lib/wallet/schema.ts";

/**
 * Prepares an operation the phone built: sponsored for a linked wallet, and paid from the wallet's own ETH for an
 * unlinked one. The phone checks the returned operation against its own callData, computes the hash itself and signs
 * it with the passkey and the wallet key.
 */
export const POST = route(async (request: Request, ctx: RouteContext<"/api/wallets/[address]/operations">) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const { callData, dapp } = await parse(request, z.object({ callData: hex, dapp: requestSchema.shape.dapp }).strict());
  const { summary, demo, review } = await assist(wallet, callData, dapp);
  await requireSponsorable(wallet, callData);
  return Response.json({ ...(await prepare(wallet, "normal", callData, review?.expiresAt)), summary, demo, review }, { headers: { "cache-control": "no-store" } });
});
