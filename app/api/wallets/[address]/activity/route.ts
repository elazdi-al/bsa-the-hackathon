import { getAbiItem, parseAbiItem, type Address } from "viem";
import { entryPoint07Abi } from "viem/account-abstraction";
import { route } from "@/lib/wallet/api/http.ts";
import { requireWallet } from "@/lib/wallet/api/operations.ts";
import { addresses, publicClient } from "@/lib/wallet/env.ts";

const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const userOperation = getAbiItem({ abi: entryPoint07Abi, name: "UserOperationEvent" });
// ponytail: a fixed window of logs; an indexer replaces it once wallets outlive it on a public chain.
const WINDOW = 50_000n;
// A block's time never changes, so each is read once. Keyed by hash: a restarted local chain reuses numbers.
const times = new Map<string, number>();

/** The wallet's USDC transfers in and out, newest first, each `sponsored` if Swissquote's paymaster paid its gas. */
export const GET = route(async (_request: Request, ctx: RouteContext<"/api/wallets/[address]/activity">) => {
  const wallet = requireWallet((await ctx.params).address as Address);
  const latest = await publicClient.getBlockNumber();
  const blocks = { fromBlock: latest > WINDOW ? latest - WINDOW : 0n, toBlock: latest };
  const query = { address: addresses.usdc, event: transfer, ...blocks };
  const [sent, received, paid] = await Promise.all([
    publicClient.getLogs({ ...query, args: { from: wallet.address } }),
    publicClient.getLogs({ ...query, args: { to: wallet.address } }),
    publicClient.getLogs({ address: addresses.entryPoint, event: userOperation, args: { sender: wallet.address, paymaster: addresses.paymaster }, ...blocks }),
  ]);
  const sponsored = new Set(paid.map((log) => log.transactionHash));
  const logs = [...new Map([...sent, ...received].map((log) => [`${log.transactionHash}:${log.logIndex}`, log])).values()].sort((a, b) =>
    a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : Number(b.blockNumber - a.blockNumber),
  );
  const unseen = [...new Set(logs.map((log) => log.blockHash))].filter((hash) => !times.has(hash));
  await Promise.all(unseen.map(async (blockHash) => times.set(blockHash, Number((await publicClient.getBlock({ blockHash })).timestamp))));
  return Response.json({
    transfers: logs.map((log) => ({
      hash: log.transactionHash,
      from: log.args.from,
      to: log.args.to,
      value: log.args.value!.toString(),
      timestamp: times.get(log.blockHash),
      sponsored: sponsored.has(log.transactionHash),
    })),
  });
});
