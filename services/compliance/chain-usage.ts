import { createPublicClient, http, parseAbiItem, type Address, type PublicClient } from "viem";
import type { ComplianceRequest, EvaluationContext, UsageProvider, UsageSnapshot } from "../../lib/compliance/types";

const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const DAY = 86_400;
// ponytail: scans a fixed window of recent blocks (about a day on Base); a bank usage ledger replaces this in live mode.
const WINDOW = 50_000n;

/**
 * Demo-mode daily usage read from the chain itself: what the account sent of each token in the last
 * 24 hours of chain time. It makes the policy's daily limit real on a local chain without a bank ledger.
 */
export class ChainUsageProvider implements UsageProvider {
  private readonly client: PublicClient;
  constructor(rpcUrl: string, private readonly tokens: Address[]) {
    this.client = createPublicClient({ transport: http(rpcUrl) });
  }

  private chainId?: Promise<number>;

  async read(_context: EvaluationContext, request: ComplianceRequest): Promise<UsageSnapshot> {
    if (request.chainId !== (await (this.chainId ??= this.client.getChainId()))) {
      return { status: "UNAVAILABLE", provider: "chain-daily-usage", mode: "demo", spent: [] };
    }
    const [latest, pending] = await Promise.all([this.client.getBlockNumber(), this.client.getBlock({ blockTag: "pending" })]);
    const fromBlock = latest > WINDOW ? latest - WINDOW : 0n;
    const logs = await this.client.getLogs({ address: this.tokens, event: transfer, args: { from: request.account }, fromBlock });
    const times = new Map<string, bigint>();
    await Promise.all(
      [...new Set(logs.map((log) => log.blockHash))].map(async (blockHash) => times.set(blockHash, (await this.client.getBlock({ blockHash })).timestamp)),
    );
    const since = pending.timestamp - BigInt(DAY);
    const spent = new Map<Address, bigint>();
    for (const log of logs) {
      if (times.get(log.blockHash)! < since) continue;
      const asset = log.address.toLowerCase() as Address;
      spent.set(asset, (spent.get(asset) ?? 0n) + log.args.value!);
    }
    return {
      status: "AVAILABLE",
      provider: "chain-daily-usage",
      mode: "demo",
      spent: [...spent].map(([asset, amount]) => ({ asset, amount: amount.toString() })),
    };
  }
}
