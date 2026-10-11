import { encodeFunctionData, maxUint256, zeroAddress, type Address } from "viem";
import { erc20Abi, vaultAbi } from "../../lib/compliance/decode";
import { parsePolicy, parseRequest } from "../../lib/compliance/schema";
import type { CompliancePolicy, ComplianceRequest, DecodedAction, ScreeningProvider, SimulationProvider, SimulationResult } from "../../lib/compliance/types";

export const DEMO = {
  chainId: 84532,
  usdc: "0x036cbd53842c5426634e7929541ec2318f3dcf7e" as Address,
  account: "0x1111111111111111111111111111111111111111" as Address,
  recipient: "0x2222222222222222222222222222222222222222" as Address,
  unknown: "0x3333333333333333333333333333333333333333" as Address,
  sanctioned: "0x098b716b8aaf21512996dc57eb0615e2383e2f96" as Address,
  /** Fixture address only. No deployed vault is claimed here. */
  vault: "0x4444444444444444444444444444444444444444" as Address,
  origin: "https://savings.demo.swissquote.example",
};

export function demoPolicy(): CompliancePolicy {
  return parsePolicy({
    version: "hackathon-demo-1", decisionTtlSeconds: 120, screeningMaxAgeSeconds: 120,
    supportedChainIds: [DEMO.chainId], nativeTransfers: [],
    tokens: [
      { chainId: DEMO.chainId, address: DEMO.usdc, symbol: "USDC", decimals: 6, approvedSpenders: [DEMO.vault] },
      { chainId: DEMO.chainId, address: DEMO.vault, symbol: "sqUSDC", decimals: 6, approvedSpenders: [] },
    ],
    contracts: [
      { chainId: DEMO.chainId, address: DEMO.usdc, name: "USDC", kind: "ERC20", allowedFunctions: ["transfer", "approve"], origins: [DEMO.origin] },
      { chainId: DEMO.chainId, address: DEMO.vault, name: "Demo savings vault", kind: "ERC4626", asset: DEMO.usdc, shareToken: DEMO.vault,
        allowedFunctions: ["deposit", "withdraw", "redeem"], origins: [DEMO.origin] },
    ],
  });
}

export class DemoScreeningProvider implements ScreeningProvider {
  constructor(private readonly now = () => new Date()) {}
  async screen(addresses: Address[]) {
    return addresses.map((address) => ({ address, status: address === DEMO.sanctioned ? "MATCH" as const : "CLEAR" as const,
      provider: "demo-sanctions-fixture", mode: "demo" as const, checkedAt: this.now().toISOString(), coverage: ["DEMO_FIXTURES_ONLY"] }));
  }
}
export class DemoSimulationProvider implements SimulationProvider {
  constructor(private readonly policy = demoPolicy(), private readonly now = () => new Date()) {}
  async simulate(request: ComplianceRequest, actions: DecodedAction[]): Promise<SimulationResult> {
    const deltas = new Map<Address | "native", bigint>();
    const add = (asset: Address | "native", amount: bigint) => deltas.set(asset, (deltas.get(asset) ?? 0n) + amount);
    for (const action of actions) {
      if (action.debit) add(action.debit.asset, -BigInt(action.debit.amount));
      if (action.creditAsset) add(action.creditAsset, BigInt(action.amount));
      if (action.type === "WITHDRAW") add(action.contract, -BigInt(action.amount));
    }
    return {
      status: "SUCCESS", provider: "demo-one-to-one-vault-simulation", mode: "demo", checkedAt: this.now().toISOString(),
      calls: request.calls.map((_, index) => ({ index, success: true })),
      assetChanges: [...deltas].map(([asset, amount]) => {
        const token = this.policy.tokens.find((item) => item.chainId === request.chainId && item.address === asset);
        return { asset, amount: amount.toString(), ...(token ? { symbol: token.symbol, decimals: token.decimals } : {}) };
      }),
      approvalChanges: actions.flatMap((action) => action.approval ? [{ ...action.approval, owner: request.account }] : []),
      transfers: actions.flatMap((action) => {
        if (!action.debit && action.type !== "WITHDRAW") return [];
        const outgoing = { asset: action.debit?.asset ?? action.contract, from: request.account,
          to: action.type === "DEPOSIT" ? action.contract : ["WITHDRAW", "REDEEM"].includes(action.type) ? zeroAddress : action.recipient!,
          amount: action.debit?.amount ?? action.amount };
        const vault = this.policy.contracts.find((item) => item.chainId === request.chainId && item.address === action.contract);
        return [outgoing, ...(["WITHDRAW", "REDEEM"].includes(action.type) && vault?.asset ? [{
          asset: vault.asset, from: action.contract, to: action.recipient!, amount: action.amount,
        }] : [])];
      }),
      touchedAddresses: actions.flatMap((action) => action.addresses), coverage: "CALL_INTENT_ONLY",
    };
  }
}

export function demoRequest(name: string, nonce = "0"): ComplianceRequest {
  const base = { requestId: name, chainId: DEMO.chainId, account: DEMO.account, nonce };
  const transfer = (recipient: Address, amount = 20_000_000n) => ({ to: DEMO.usdc,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [recipient, amount] }) });
  const examples: Record<string, unknown> = {
    transfer: { ...base, calls: [transfer(DEMO.recipient)] },
    sanctioned: { ...base, calls: [transfer(DEMO.sanctioned)] },
    "unknown-contract": { ...base, calls: [{ ...transfer(DEMO.recipient), to: DEMO.unknown }] },
    "unlimited-approval": { ...base, calls: [{ to: DEMO.usdc,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [DEMO.vault, maxUint256] }) }] },
    "vault-deposit": { ...base, dapp: { origin: DEMO.origin }, calls: [
      { to: DEMO.usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [DEMO.vault, 250_000_000n] }) },
      { to: DEMO.vault, data: encodeFunctionData({ abi: vaultAbi, functionName: "deposit", args: [250_000_000n, DEMO.account] }) },
    ] },
  };
  if (!examples[name]) throw new Error(`Unknown demo scenario: ${name}`);
  return parseRequest(examples[name]);
}
