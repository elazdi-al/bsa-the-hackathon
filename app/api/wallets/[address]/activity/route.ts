import { parseAbiItem, type Address } from "viem";
import { route } from "@/lib/wallet/api/http.ts";
import { requireWallet } from "@/lib/wallet/api/operations.ts";
import { addresses, publicClient } from "@/lib/wallet/env.ts";

const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
// ponytail: a fixed window of logs; an indexer replaces it once wallets outlive it on a public chain.
const WINDOW = 50_000n;

/** The wallet's USDC transfers in and out, newest first. */
export const GET = route(async (_request: Request, ctx: RouteContext<"/api/wallets/[address]/activity">) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const latest = await publicClient.getBlockNumber();
  const query = { address: addresses.usdc, event: transfer, fromBlock: latest > WINDOW ? latest - WINDOW : 0n, toBlock: latest };
  const [sent, received] = await Promise.all([
    publicClient.getLogs({ ...query, args: { from: wallet.address } }),
    publicClient.getLogs({ ...query, args: { to: wallet.address } }),
  ]);
  const logs = [...new Map([...sent, ...received].map((log) => [`${log.transactionHash}:${log.logIndex}`, log])).values()].sort((a, b) =>
    a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : Number(b.blockNumber - a.blockNumber),
  );
  const blocks = [...new Set(logs.map((log) => log.blockNumber))];
  const times = new Map(
    await Promise.all(blocks.map(async (blockNumber) => [blockNumber, Number((await publicClient.getBlock({ blockNumber })).timestamp)] as const)),
  );
  return Response.json({
    transfers: logs.map((log) => ({
      hash: log.transactionHash,
      from: log.args.from,
      to: log.args.to,
      value: log.args.value!.toString(),
      timestamp: times.get(log.blockNumber),
    })),
  });
});
