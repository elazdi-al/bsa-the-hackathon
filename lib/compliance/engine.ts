import { zeroAddress, type Address } from "viem";
import { hashPayload, hashRequest } from "./canonical";
import { decodeRequest, findToken } from "./decode";
import { parsePolicy, parseRequest } from "./schema";
import type { AuditSink, ComplianceDecision, CompliancePolicy, ComplianceRequest, DecodedAction, DecisionSigner, DecisionStatus,
  EvaluationContext, Finding, ScreeningProvider, ScreeningResult, SignedDecision, SimulationProvider, SimulationResult, UsageProvider, UsageSnapshot } from "./types";

const rank: Record<DecisionStatus, number> = { ALLOW: 0, STEP_UP: 1, REVIEW: 2, DENY_ASSISTANCE: 3 };
export interface EngineDependencies {
  screening: ScreeningProvider;
  simulation: SimulationProvider;
  usage: UsageProvider;
  signer: DecisionSigner;
  audit: AuditSink;
  now?: () => Date;
  newId: () => string;
  mode: "demo" | "live";
}

export class ComplianceEngine {
  readonly policy: CompliancePolicy;
  private readonly dependencies: EngineDependencies;
  constructor(policy: unknown, dependencies: EngineDependencies) {
    this.policy = freezePolicy(parsePolicy(policy));
    this.dependencies = dependencies;
  }

  async evaluate(input: unknown, context: EvaluationContext): Promise<SignedDecision> {
    if (!context.subject || context.subject.length > 128) throw new Error("A trusted subject is required");
    const request = parseRequest(input);
    const clock = this.dependencies.now ?? (() => new Date());
    const issuedAt = clock().toISOString();
    const { actions, findings } = decodeRequest(request, this.policy);
    const add = (code: string, message: string, status: Finding["status"]) => findings.push({ code, message, status });
    if (!this.policy.supportedChainIds.includes(request.chainId)) add("CHAIN_NOT_SUPPORTED", "Swissquote assistance is not configured for this chain.", "DENY_ASSISTANCE");
    let simulation: SimulationResult = { status: "UNAVAILABLE", provider: "not-run", mode: this.dependencies.mode, checkedAt: issuedAt,
      calls: [], assetChanges: [], approvalChanges: [], transfers: [], touchedAddresses: [], coverage: "CALL_INTENT_ONLY" };
    let screening: ScreeningResult[] = [];
    let usage: UsageSnapshot = { status: "UNAVAILABLE", provider: "not-run", mode: this.dependencies.mode, spent: [] };

    if (!findings.some((item) => item.status === "DENY_ASSISTANCE")) {
      const addresses = uniqueAddresses([request.account, ...request.calls.map((call) => call.to), ...actions.flatMap((action) => action.addresses)]);
      const results = await Promise.allSettled([
        this.dependencies.screening.screen(addresses, request.chainId),
        this.dependencies.simulation.simulate(request, actions),
        this.dependencies.usage.read(context, request),
      ]);
      if (results[0].status === "fulfilled") screening = results[0].value;
      if (results[1].status === "fulfilled") simulation = results[1].value;
      if (results[2].status === "fulfilled") usage = results[2].value;
      const extra = uniqueAddresses(simulation.touchedAddresses).filter((item) => !addresses.includes(item));
      if (extra.length) {
        try { screening.push(...await this.dependencies.screening.screen(extra, request.chainId)); }
        catch { /* Coverage validation below converts this into REVIEW. */ }
      }
      this.checkScreening(uniqueAddresses([...addresses, ...extra]), screening, clock(), add);
      const simulationAge = clock().getTime() - Date.parse(simulation.checkedAt);
      if (!Number.isFinite(simulationAge) || simulationAge < -5000 || simulationAge > this.policy.screeningMaxAgeSeconds * 1000) {
        add("SIMULATION_STALE", "Fresh simulation evidence is required.", "REVIEW");
      }
      this.checkSimulation(request, actions, simulation, add);
      this.checkLimits(request, actions, simulation, usage, add);
      if (this.dependencies.mode === "live" && [simulation.mode, usage.mode, ...screening.map((result) => result.mode)].includes("demo")) {
        add("DEMO_PROVIDER_IN_LIVE_MODE", "Demo evidence cannot authorize live assistance.", "REVIEW");
      }
    }
    const status = findings.reduce<DecisionStatus>((current, finding) => rank[finding.status] > rank[current] ? finding.status : current, "ALLOW");
    const decision: ComplianceDecision = {
      schemaVersion: "1", decisionId: this.dependencies.newId(), requestId: request.requestId,
      requestHash: hashRequest(request), policyVersion: this.policy.version,
      policyHash: hashPayload("swissquote-compliance/policy/v1", this.policy),
      subjectHash: hashPayload("swissquote-compliance/subject/v1", context.subject),
      status, riskLevel: status === "DENY_ASSISTANCE" ? "CRITICAL" : status === "REVIEW" ? "HIGH" : status === "STEP_UP" ? "MEDIUM" : "LOW",
      reasons: findings, decodedActions: actions, summary: actions.map((action) => action.summary),
      screening, simulation, usage,
      requiredActions: status === "STEP_UP" ? ["REQUIRE_ADDITIONAL_USER_AUTHENTICATION"] :
        status === "REVIEW" ? ["REQUIRE_MANUAL_REVIEW_OR_RETRY"] : status === "DENY_ASSISTANCE" ? ["REFUSE_COSIGNING_AND_SPONSORSHIP"] : [],
      issuedAt, expiresAt: new Date(clock().getTime() + this.policy.decisionTtlSeconds * 1000).toISOString(),
      assurance: this.dependencies.mode === "demo" ? "DEMO" : "LIVE_PROVIDERS",
      limitations: ["Policy governs Swissquote assistance; it cannot freeze an independently controlled wallet.",
        "Call simulation does not validate wallet wrappers, deployment, execution modules, signatures or gas payment.",
        "dApp origins are self-reported; an allowlist match does not authenticate the website.",
        "Daily usage is a snapshot; the caller must atomically reserve and settle spending before signing.",
        "This decision is not Travel Rule clearance, KYC clearance or a legal compliance certification."],
    };
    const receipt = this.dependencies.signer.sign(decision);
    await this.dependencies.audit.append(receipt);
    return receipt;
  }

  private checkScreening(addresses: Address[], results: ScreeningResult[], now: Date,
    add: (code: string, message: string, status: Finding["status"]) => void) {
    for (const address of addresses) {
      const records = results.filter((result) => result.address.toLowerCase() === address);
      if (records.some((result) => result.status === "MATCH")) add("SANCTIONS_MATCH", `A sanctions screening match was reported for ${address}.`, "DENY_ASSISTANCE");
      const fresh = records.some((result) => {
        const age = now.getTime() - Date.parse(result.checkedAt);
        return result.status === "CLEAR" && Number.isFinite(age) && age >= -5000 && age <= this.policy.screeningMaxAgeSeconds * 1000;
      });
      if (!fresh && !records.some((result) => result.status === "MATCH")) add("SCREENING_UNAVAILABLE", `Current sanctions evidence is unavailable for ${address}.`, "REVIEW");
    }
  }

  private checkSimulation(request: ComplianceRequest, actions: DecodedAction[], result: SimulationResult,
    add: (code: string, message: string, status: Finding["status"]) => void) {
    if (result.status === "UNAVAILABLE") return add("SIMULATION_UNAVAILABLE", "The transaction could not be simulated.", "REVIEW");
    if (result.status === "REVERTED" || result.calls.some((call) => !call.success)) return add("SIMULATION_REVERTED", "At least one proposed call would fail.", "DENY_ASSISTANCE");
    if (result.calls.length !== request.calls.length || result.calls.some((call, index) => call.index !== index)) {
      return add("SIMULATION_INCOMPLETE", "Simulation did not cover every call in order.", "REVIEW");
    }
    const debits = new Map<string, bigint>();
    for (const action of actions) if (action.debit) debits.set(action.debit.asset, (debits.get(action.debit.asset) ?? 0n) + BigInt(action.debit.amount));
    const withdrawalShares = new Set(actions.filter((action) => action.type === "WITHDRAW").map((action) => action.contract));
    const deltas = new Map<string, bigint>();
    for (const change of result.assetChanges) deltas.set(change.asset, (deltas.get(change.asset) ?? 0n) + BigInt(change.amount));
    for (const [asset, delta] of deltas) {
      if (delta < 0n && !withdrawalShares.has(asset as Address) && -delta > (debits.get(asset) ?? 0n)) {
        add("UNEXPECTED_ASSET_LOSS", `Simulation removes more ${asset} than the reviewed intent permits.`, "DENY_ASSISTANCE");
      }
    }
    for (const [asset, amount] of debits) {
      if (!deltas.has(asset)) add("ASSET_CHANGES_INCOMPLETE", `Simulation did not measure ${asset}.`, "REVIEW");
      else if (!actions.some((action) => action.creditAsset === asset) && deltas.get(asset) !== -amount) {
        add("ASSET_AMOUNT_MISMATCH", `Simulation does not confirm the intended amount of ${asset}.`, "DENY_ASSISTANCE");
      }
    }
    for (const action of actions) {
      if (action.type === "DEPOSIT" && BigInt(action.amount) > 0n && (deltas.get(action.creditAsset!) ?? 0n) <= 0n) {
        // A deposit then redeem batch cannot use the optimistic single-deposit policy.
        add("VAULT_SHARES_NOT_RECEIVED", "The deposit does not leave positive vault shares in the account.", "DENY_ASSISTANCE");
      }
      if (action.type === "WITHDRAW" || action.type === "REDEEM") {
        const contract = this.policy.contracts.find((item) => item.chainId === request.chainId && item.address === action.contract);
        const received = result.transfers.filter((transfer) => transfer.asset === contract?.asset && transfer.from === action.contract && transfer.to === action.recipient)
          .reduce((sum, transfer) => sum + BigInt(transfer.amount), 0n);
        if (BigInt(action.amount) > 0n && (action.type === "WITHDRAW" ? received < BigInt(action.amount) : received <= 0n)) {
          add("VAULT_OUTPUT_NOT_CONFIRMED", "Simulation does not confirm the vault's underlying asset reaching the requested recipient.", "REVIEW");
        }
      }
      if (action.type === "SWAP") {
        const received = result.transfers.filter((transfer) => transfer.asset === action.creditAsset && transfer.from === action.contract && transfer.to === request.account)
          .reduce((sum, transfer) => sum + BigInt(transfer.amount), 0n);
        if (received < BigInt(action.minCreditAmount!)) add("SWAP_OUTPUT_NOT_CONFIRMED", "Simulation does not confirm the swap's minimum output reaching the account.", "REVIEW");
      }
    }
    // Net balance changes can conceal a transfer to the wrong recipient. Check gross events too.
    const observed = new Map<string, bigint>();
    const permitted = new Map<string, bigint>();
    for (const action of actions) {
      if (!action.debit) continue;
      const recipient = action.type === "DEPOSIT" || action.type === "SWAP" ? action.contract : action.type === "REDEEM" ? zeroAddress : action.recipient;
      const key = `${action.debit.asset}:${recipient}`;
      permitted.set(key, (permitted.get(key) ?? 0n) + BigInt(action.debit.amount));
    }
    for (const transfer of result.transfers) {
      if (transfer.from !== request.account) continue;
      const key = `${transfer.asset}:${transfer.to}`;
      observed.set(key, (observed.get(key) ?? 0n) + BigInt(transfer.amount));
      const withdrawBurn = withdrawalShares.has(transfer.asset as Address) && transfer.to === zeroAddress;
      if (!withdrawBurn && transfer.to !== request.account && observed.get(key)! > (permitted.get(key) ?? 0n)) {
        add("UNEXPECTED_RECIPIENT", "Simulation transfers assets to an address or in an amount outside the reviewed intent.", "DENY_ASSISTANCE");
      }
    }
    for (const [key, amount] of permitted) {
      if (amount > 0n && (observed.get(key) ?? 0n) < amount) add("TRANSFER_EVIDENCE_MISSING", "Simulation did not confirm the expected transfer recipient and amount.", "REVIEW");
    }
    const approvals = actions.flatMap((action) => action.approval ? [action.approval] : []);
    for (const approval of result.approvalChanges) {
      if (approval.owner !== request.account) continue;
      // A swap's transferFrom may report the reviewed allowance it spent ending at zero.
      if (approval.amount === "0" && actions.some((action) => action.type === "SWAP" && action.contract === approval.spender && action.debit?.asset === approval.token)) continue;
      if (!approvals.some((expected) => expected.token === approval.token && expected.spender === approval.spender && expected.amount === approval.amount)) {
        add("UNEXPECTED_APPROVAL", "Simulation grants a spending permission outside the reviewed intent.", "DENY_ASSISTANCE");
      }
    }
    for (const approval of approvals) {
      if (!result.approvalChanges.some((actual) => actual.owner === request.account && actual.token === approval.token && actual.spender === approval.spender && actual.amount === approval.amount)) {
        add("APPROVAL_EVIDENCE_MISSING", "Simulation did not confirm the requested spending permission.", "REVIEW");
      }
    }
  }

  private checkLimits(request: ComplianceRequest, actions: DecodedAction[], simulation: SimulationResult, usage: UsageSnapshot,
    add: (code: string, message: string, status: Finding["status"]) => void) {
    const spending = new Map<string, bigint>();
    const approvals = new Map<string, bigint>();
    for (const action of actions) {
      if (action.debit) spending.set(action.debit.asset, (spending.get(action.debit.asset) ?? 0n) + BigInt(action.debit.amount));
      if (action.approval) approvals.set(action.approval.token, (approvals.get(action.approval.token) ?? 0n) + BigInt(action.amount));
    }
    // A withdraw's share cost is known only after simulation. Do not omit it from limits.
    for (const change of simulation.assetChanges) if (BigInt(change.amount) < 0n) {
      const amount = -BigInt(change.amount);
      if (amount > (spending.get(change.asset) ?? 0n)) spending.set(change.asset, amount);
    }
    const amounts = new Map(spending);
    for (const [asset, amount] of approvals) if (amount > (amounts.get(asset) ?? 0n)) amounts.set(asset, amount);
    for (const [asset, amount] of amounts) {
      const token = findToken(this.policy, request.chainId, asset);
      const native = asset === "native" ? this.policy.nativeTransfers.find((item) => item.chainId === request.chainId) : undefined;
      const max = token?.maxTransactionAmount ?? native?.maxAmount;
      const stepUp = token?.stepUpAmount ?? native?.stepUpAmount;
      if (max && amount > BigInt(max)) add("TRANSACTION_LIMIT_EXCEEDED", `The batch exceeds the ${token?.symbol ?? "native token"} transaction limit.`, "DENY_ASSISTANCE");
      else if (stepUp && amount > BigInt(stepUp)) add("HIGH_VALUE_STEP_UP", "The amount requires additional user authentication.", "STEP_UP");
      if (token?.dailyLimitAmount) {
        const spent = usage.spent.filter((item) => item.asset === asset).reduce((sum, item) => sum + BigInt(item.amount), 0n);
        if (usage.status !== "AVAILABLE") add("DAILY_USAGE_UNAVAILABLE", "A trusted daily usage snapshot is unavailable.", "REVIEW");
        else if (spent + (spending.get(asset) ?? 0n) > BigInt(token.dailyLimitAmount)) add("DAILY_LIMIT_EXCEEDED", "The operation would exceed the daily limit.", "DENY_ASSISTANCE");
      }
    }
  }
}

function uniqueAddresses(addresses: string[]): Address[] {
  return [...new Set(addresses.map((item) => item.toLowerCase()))].filter((item) => /^0x[a-f0-9]{40}$/.test(item) && !/^0x0{40}$/.test(item)) as Address[];
}

function freezePolicy<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezePolicy(child);
    Object.freeze(value);
  }
  return value;
}
