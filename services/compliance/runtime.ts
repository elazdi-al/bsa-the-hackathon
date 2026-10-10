import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ComplianceEngine } from "../../lib/compliance/engine";
import { parsePolicy } from "../../lib/compliance/schema";
import { FileAuditSink } from "./audit";
import { demoPolicy, DemoScreeningProvider, DemoSimulationProvider, DemoUsageProvider, UnavailableUsageProvider } from "./demo";
import { Ed25519DecisionSigner } from "./signing";
import { TrmScreeningProvider } from "./trm";
import { ViemSimulationProvider } from "./viem-simulation";

export interface ComplianceRuntime { engine: ComplianceEngine; signer: Ed25519DecisionSigner; mode: "demo" | "live" }
export function createComplianceRuntime(env: Record<string, string | undefined> = process.env): ComplianceRuntime {
  const mode = env.COMPLIANCE_MODE ?? "demo";
  if (mode !== "demo" && mode !== "live") throw new Error("Invalid COMPLIANCE_MODE");
  if (mode === "live" && (!env.COMPLIANCE_POLICY_FILE || !env.COMPLIANCE_SIGNING_PRIVATE_KEY || !env.COMPLIANCE_RPC_URLS || !env.COMPLIANCE_API_KEY)) {
    throw new Error("Live mode requires a policy file, persistent Ed25519 key, RPC URLs and an API key");
  }
  // Operator-mounted runtime data must not cause Next.js to bundle the entire project.
  const policy = env.COMPLIANCE_POLICY_FILE ? parsePolicy(JSON.parse(readFileSync(resolve(/* turbopackIgnore: true */ env.COMPLIANCE_POLICY_FILE), "utf8"))) : demoPolicy();
  const signer = new Ed25519DecisionSigner(env.COMPLIANCE_SIGNING_PRIVATE_KEY?.replace(/\\n/g, "\n"));
  const rpcUrls = env.COMPLIANCE_RPC_URLS ? JSON.parse(env.COMPLIANCE_RPC_URLS) as Record<number, string> : {};
  for (const [chainId, url] of Object.entries(rpcUrls)) {
    const parsed = new URL(url);
    if (!Number.isSafeInteger(Number(chainId)) || Number(chainId) <= 0 || parsed.protocol !== "https:") throw new Error("RPC configuration requires numeric chain IDs and HTTPS URLs");
  }
  const engine = new ComplianceEngine(policy, {
    mode, newId: randomUUID, signer,
    audit: new FileAuditSink(env.COMPLIANCE_AUDIT_FILE ? resolve(/* turbopackIgnore: true */ env.COMPLIANCE_AUDIT_FILE) : resolve(process.cwd(), "var", "compliance", "audit.ndjson")),
    screening: mode === "demo" ? new DemoScreeningProvider() : new TrmScreeningProvider({ apiKey: env.TRM_API_KEY }),
    simulation: mode === "demo" ? new DemoSimulationProvider(policy) : new ViemSimulationProvider(rpcUrls),
    usage: mode === "demo" ? new DemoUsageProvider() : new UnavailableUsageProvider(),
  });
  return { engine, signer, mode };
}

const globalRuntime = globalThis as typeof globalThis & { swissquoteCompliance?: ComplianceRuntime };
export function getComplianceRuntime(): ComplianceRuntime {
  return globalRuntime.swissquoteCompliance ??= createComplianceRuntime();
}
