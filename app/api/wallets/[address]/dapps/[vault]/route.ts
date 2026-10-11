import { TransactionReceiptNotFoundError } from "viem";
import * as z from "zod";
import { amountSchema } from "@/lib/compliance/schema";
import { HttpError, parse, route } from "@/lib/wallet/api/http";
import { requireWallet } from "@/lib/wallet/api/operations";
import { publicClient } from "@/lib/wallet/env";
import { address, bytes32 } from "@/lib/wallet/schema";
import { quoteVault, readVaultSnapshot, requireDapp } from "@/services/dapps/wallet";

type Context = RouteContext<"/api/wallets/[address]/dapps/[vault]">;
async function context(ctx: Context) {
  const params = await ctx.params;
  const wallet = requireWallet(address.parse(params.address));
  return { wallet, vault: await requireDapp(address.parse(params.vault)) };
}
export const GET = route(async (request: Request, ctx: Context) => {
  const { wallet, vault } = await context(ctx);
  const afterTx = new URL(request.url).searchParams.get("afterTx");
  let minimumBlock: bigint | undefined;
  if (afterTx !== null) {
    const hash = bytes32.parse(afterTx);
    const receipt = await publicClient.getTransactionReceipt({ hash }).catch((error: unknown) => {
      if (error instanceof TransactionReceiptNotFoundError) throw new HttpError(409, "The transaction is not confirmed yet. Refresh again.");
      throw error;
    });
    if (receipt.status !== "success") throw new HttpError(409, "The transaction did not succeed.");
    minimumBlock = receipt.blockNumber;
  }
  return Response.json(await readVaultSnapshot(vault, wallet.address, minimumBlock), { headers: { "cache-control": "no-store" } });
});
export const POST = route(async (request: Request, ctx: Context) => {
  const { action, amount } = await parse(request, z.object({ action: z.enum(["deposit", "withdraw", "revoke"]), amount: amountSchema }).strict());
  const { wallet, vault } = await context(ctx);
  return Response.json(await quoteVault(vault, wallet.address, action, BigInt(amount)), { headers: { "cache-control": "no-store" } });
});
