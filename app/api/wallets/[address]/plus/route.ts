import { erc20Abi, formatUnits, isAddressEqual, parseEventLogs, TransactionReceiptNotFoundError, type Address } from "viem";
import * as z from "zod";
import { store } from "@/lib/wallet/api/db.ts";
import { HttpError, parse, route } from "@/lib/wallet/api/http.ts";
import { requireWallet } from "@/lib/wallet/api/operations.ts";
import { addresses, chainNow, plus, publicClient } from "@/lib/wallet/env.ts";
import { bytes32 } from "@/lib/wallet/schema.ts";

const body = z.object({ session: z.string(), transactionHash: bytes32 });

/**
 * The client claims Swissquote Plus with a payment the wallet made on-chain: at least its price in USDC, to Swissquote.
 * Each payment buys one period, once. Plus is a product for Swissquote's clients, so only the client who linked the
 * wallet claims it, and it is theirs, not the wallet's. A self-custody wallet can't be debited, so it never renews itself.
 */
export const POST = route(async (request: Request, ctx: RouteContext<"/api/wallets/[address]/plus">) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const input = await parse(request, body);
  const client = store().clientBySession(input.session);
  if (!client) throw new HttpError(401, "Sign in to Swissquote first.");
  if (store().owner(wallet.address)?.client !== client.number) {
    throw new HttpError(403, "Swissquote Plus is for Swissquote clients. Link this wallet to your Swissquote account first.", { refused: "unlinked" });
  }
  const receipt = await publicClient.getTransactionReceipt({ hash: input.transactionHash }).catch((error: unknown) => {
    if (error instanceof TransactionReceiptNotFoundError) return undefined;
    throw error;
  });
  const paid =
    receipt?.status === "success" &&
    parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs }).some(
      ({ address, args }) =>
        isAddressEqual(address, addresses.usdc) && isAddressEqual(args.from, wallet.address) && isAddressEqual(args.to, addresses.swissquote) && args.value >= plus.price,
    );
  if (!paid) throw new HttpError(402, `That transaction doesn't pay Swissquote ${formatUnits(plus.price, 6)} USDC from this wallet.`, { refused: "payment" });
  const until = store().addPlus(input.transactionHash, client.number, await chainNow(), plus.period);
  if (until === undefined) throw new HttpError(409, "That payment already paid for Swissquote Plus.", { refused: "claimed" });
  return Response.json({ until });
});
