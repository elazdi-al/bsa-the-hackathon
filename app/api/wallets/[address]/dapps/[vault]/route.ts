import * as z from "zod";
import { amountSchema } from "@/lib/compliance/schema";
import { parse, route } from "@/lib/wallet/api/http";
import { requireWallet } from "@/lib/wallet/api/operations";
import { address } from "@/lib/wallet/schema";
import { quoteVault, readVaultSnapshot, requireDapp } from "@/services/dapps/wallet";

type Context = RouteContext<"/api/wallets/[address]/dapps/[vault]">;
async function context(ctx: Context) {
  const params = await ctx.params;
  const wallet = requireWallet(address.parse(params.address));
  return { wallet, vault: await requireDapp(address.parse(params.vault)) };
}
export const GET = route(async (_request: Request, ctx: Context) => {
  const { wallet, vault } = await context(ctx);
  return Response.json(await readVaultSnapshot(vault, wallet.address), { headers: { "cache-control": "no-store" } });
});
export const POST = route(async (request: Request, ctx: Context) => {
  const { action, amount } = await parse(request, z.object({ action: z.enum(["deposit", "withdraw", "revoke"]), amount: amountSchema }).strict());
  const { wallet, vault } = await context(ctx);
  return Response.json(await quoteVault(vault, wallet.address, action, BigInt(amount)), { headers: { "cache-control": "no-store" } });
});
