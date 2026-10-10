import { createPublicClient, decodeEventLog, ethAddress, http, parseAbi, zeroAddress, type Address, type PublicClient } from "viem";
import type { ApprovalChange, ComplianceRequest, SimulationProvider, SimulationResult, TransferChange } from "../../lib/compliance/types";

const eventAbi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
]);
type SimulationClient = Pick<PublicClient, "getChainId" | "simulateCalls">;
export class ViemSimulationProvider implements SimulationProvider {
  private readonly clients: Map<number, SimulationClient>;
  constructor(rpcUrls: Record<number, string>, private readonly now = () => new Date(),
    clientFactory: (url: string) => SimulationClient = (url) => createPublicClient({ transport: http(url, { timeout: 8000, retryCount: 0 }), ccipRead: false })) {
    this.clients = new Map(Object.entries(rpcUrls).map(([chainId, url]) => [Number(chainId),
      clientFactory(url),
    ]));
  }
  async simulate(request: ComplianceRequest): Promise<SimulationResult> {
    const checkedAt = this.now().toISOString();
    const unavailable: SimulationResult = { status: "UNAVAILABLE", provider: "viem-eth-simulate-v1", mode: "live", checkedAt,
      calls: [], assetChanges: [], approvalChanges: [], transfers: [], touchedAddresses: [], coverage: "CALL_INTENT_ONLY" };
    const client = this.clients.get(request.chainId);
    if (!client) return unavailable;
    try {
      if (await client.getChainId() !== request.chainId) return unavailable;
      // Stateful sequence from the actual account; no fake balances/allowances/signatures.
      const result = await client.simulateCalls({ account: request.account,
        calls: request.calls.map((call) => ({ to: call.to, value: BigInt(call.value), data: call.data })),
        traceAssetChanges: true, traceTransfers: true, validation: false,
      });
      const touched = new Set<Address>(request.calls.map((call) => call.to));
      const approvalChanges: ApprovalChange[] = [];
      const transfers: TransferChange[] = [];
      const calls = result.results.map((call, index) => {
        for (const log of call.logs ?? []) {
          if (log.address !== ethAddress) touched.add(log.address.toLowerCase() as Address);
          try {
            const decoded = decodeEventLog({ abi: eventAbi, data: log.data, topics: log.topics });
            const endpoints = decoded.eventName === "Approval" ? [decoded.args.owner, decoded.args.spender] : [decoded.args.from, decoded.args.to];
            for (const address of endpoints) if (address !== zeroAddress) touched.add(address.toLowerCase() as Address);
            if (decoded.eventName === "Approval") approvalChanges.push({ token: log.address.toLowerCase() as Address,
              owner: decoded.args.owner.toLowerCase() as Address, spender: decoded.args.spender.toLowerCase() as Address, amount: decoded.args.value.toString() });
            else transfers.push({ asset: log.address.toLowerCase() === ethAddress.toLowerCase() ? "native" : log.address.toLowerCase() as Address,
              from: decoded.args.from.toLowerCase() as Address, to: decoded.args.to.toLowerCase() as Address, amount: decoded.args.value.toString() });
          } catch { /* Unknown events are not treated as proof of approval. */ }
        }
        return { index, success: call.status === "success", ...(call.status === "failure" ? { error: "SIMULATED_CALL_REVERTED" } : {}) };
      });
      return { ...unavailable, status: calls.every((call) => call.success) ? "SUCCESS" : "REVERTED",
        blockNumber: result.block.number?.toString(), calls, approvalChanges, transfers, touchedAddresses: [...touched],
        assetChanges: result.assetChanges.map((change) => ({
          asset: change.token.address.toLowerCase() === ethAddress.toLowerCase() ? "native" : change.token.address.toLowerCase() as Address,
          amount: change.value.diff.toString(), symbol: change.token.symbol, decimals: change.token.decimals,
        })),
      };
    } catch { return unavailable }
  }
}
