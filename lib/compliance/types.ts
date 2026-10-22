import type { Address, Hex } from "viem";

export type DecisionStatus = "ALLOW" | "REVIEW" | "DENY_ASSISTANCE";
export type RiskLevel = "LOW" | "HIGH" | "CRITICAL";
export type ProviderMode = "demo" | "live";

export interface ComplianceRequest {
  requestId: string;
  chainId: number;
  account: Address;
  /** The wallet adapter verifies its own nonce or session identifier. */
  nonce: string;
  /** Optional final signing digest, recomputed by the wallet adapter. */
  operationHash?: Hex;
  calls: Array<{ to: Address; value: string; data: Hex; operation: "CALL" | "DELEGATECALL" }>;
  /** Self-reported connection metadata, never an identity attestation. */
  dapp?: { origin: string; name?: string };
}

export interface TokenPolicy {
  chainId: number;
  address: Address;
  symbol: string;
  decimals: number;
  approvedSpenders: Address[];
}
export interface ContractPolicy {
  chainId: number;
  address: Address;
  name: string;
  kind: "ERC20" | "ERC4626" | "SWAP";
  allowedFunctions: string[];
  asset?: Address;
  shareToken?: Address;
  /** The two registered tokens a SWAP pool trades. */
  tokens?: [Address, Address];
  origins: string[];
}
export interface CompliancePolicy {
  version: string;
  decisionTtlSeconds: number;
  screeningMaxAgeSeconds: number;
  supportedChainIds: number[];
  tokens: TokenPolicy[];
  contracts: ContractPolicy[];
  nativeTransfers: Array<{ chainId: number }>;
}

export interface Finding {
  code: string;
  message: string;
  status: Exclude<DecisionStatus, "ALLOW">;
  callIndex?: number;
}
export interface DecodedAction {
  callIndex: number;
  type: "TRANSFER" | "APPROVAL" | "DEPOSIT" | "WITHDRAW" | "REDEEM" | "NATIVE_TRANSFER" | "SWAP";
  contract: Address;
  functionName: string;
  summary: string;
  addresses: Address[];
  debit?: { asset: Address | "native"; amount: string };
  creditAsset?: Address;
  /** The least of creditAsset the account receives. Only a swap states one. */
  minCreditAmount?: string;
  recipient?: Address;
  spender?: Address;
  amount: string;
  approval?: { token: Address; spender: Address; amount: string };
}
export interface AssetChange {
  asset: Address | "native";
  amount: string; // signed base-unit integer, relative to the account
  symbol?: string;
  decimals?: number;
}
export interface ApprovalChange { token: Address; owner: Address; spender: Address; amount: string }
export interface TransferChange { asset: Address | "native"; from: Address; to: Address; amount: string }
export interface ScreeningResult {
  address: Address;
  status: "CLEAR" | "MATCH" | "UNAVAILABLE";
  provider: string;
  mode: ProviderMode;
  checkedAt: string;
  coverage: string[];
}
export interface SimulationResult {
  status: "SUCCESS" | "REVERTED" | "UNAVAILABLE";
  provider: string;
  mode: ProviderMode;
  checkedAt: string;
  blockNumber?: string;
  calls: Array<{ index: number; success: boolean; error?: string }>;
  assetChanges: AssetChange[];
  approvalChanges: ApprovalChange[];
  transfers: TransferChange[];
  touchedAddresses: Address[];
  coverage: "CALL_INTENT_ONLY";
}
export interface EvaluationContext {
  /** Resolved by trusted server-side authentication, outside the dApp body. */
  subject: string;
}
export interface ComplianceDecision {
  schemaVersion: "1";
  decisionId: string;
  requestId: string;
  requestHash: Hex;
  policyVersion: string;
  policyHash: Hex;
  subjectHash: Hex;
  status: DecisionStatus;
  riskLevel: RiskLevel;
  reasons: Finding[];
  decodedActions: DecodedAction[];
  summary: string[];
  screening: ScreeningResult[];
  simulation: SimulationResult;
  requiredActions: string[];
  issuedAt: string;
  expiresAt: string;
  assurance: "DEMO" | "LIVE_PROVIDERS";
  limitations: string[];
}
export interface SignedDecision {
  decision: ComplianceDecision;
  proof: { algorithm: "Ed25519"; keyId: string; signature: string };
}
export interface ScreeningProvider { screen(addresses: Address[], chainId: number): Promise<ScreeningResult[]> }
export interface SimulationProvider { simulate(request: ComplianceRequest, actions: DecodedAction[]): Promise<SimulationResult> }
export interface DecisionSigner { sign(decision: ComplianceDecision): SignedDecision }
export interface AuditSink { append(receipt: SignedDecision): Promise<void> }
