import { isAddressEqual, parseAbiItem, type Address } from "viem";
import { route } from "@/lib/wallet/api/http.ts";
import { requireWallet } from "@/lib/wallet/api/operations.ts";
import { addresses, publicClient } from "@/lib/wallet/env.ts";

const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
// ponytail: a fixed window of logs; an indexer replaces it once wallets outlive it on a public chain.
const WINDOW = 50_000n;
// A block's time never changes, so each is read once. Keyed by hash: a restarted local chain reuses numbers.
const times = new Map<string, number>();

/** The wallet's USDC and WETH transfers in and out, newest first. */
export const GET = route(async (_request: Request, ctx: RouteContext<"/api/wallets/[address]/activity">) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const latest = await publicClient.getBlockNumber();
  const tokens = addresses.weth ? [addresses.usdc, addresses.weth] : [addresses.usdc];
  const query = { address: tokens, event: transfer, fromBlock: latest > WINDOW ? latest - WINDOW : 0n, toBlock: latest };
  const [sent, received] = await Promise.all([
    publicClient.getLogs({ ...query, args: { from: wallet.address } }),
    publicClient.getLogs({ ...query, args: { to: wallet.address } }),
  ]);
  const logs = [...new Map([...sent, ...received].map((log) => [`${log.transactionHash}:${log.logIndex}`, log])).values()].sort((a, b) =>
    a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : Number(b.blockNumber - a.blockNumber),
  );
  const unseen = [...new Set(logs.map((log) => log.blockHash))].filter((hash) => !times.has(hash));
  await Promise.all(unseen.map(async (blockHash) => times.set(blockHash, Number((await publicClient.getBlock({ blockHash })).timestamp))));
  return Response.json({
    transfers: logs.map((log) => ({
      hash: log.transactionHash,
      token: isAddressEqual(log.address, addresses.usdc) ? "usdc" : "weth",
      from: log.args.from,
      to: log.args.to,
      value: log.args.value!.toString(),
      timestamp: times.get(log.blockHash),
    })),
  });
});
