import { randomUUID } from "node:crypto";
import { ComplianceEngine } from "../lib/compliance/engine";
import { hashPayload } from "../lib/compliance/canonical";
import { MemoryAuditSink, verifyAuditRecords } from "../services/compliance/audit";
import { DEMO, demoPolicy, demoRequest, DemoScreeningProvider, DemoSimulationProvider, DemoUsageProvider } from "../services/compliance/demo";
import { Ed25519DecisionSigner, verifyDecision } from "../services/compliance/signing";

async function main() {
  const policy = demoPolicy();
  const signer = new Ed25519DecisionSigner();
  const audit = new MemoryAuditSink();
  const engine = new ComplianceEngine(policy, { mode: "demo", newId: randomUUID, signer, audit,
    screening: new DemoScreeningProvider(), simulation: new DemoSimulationProvider(policy), usage: new DemoUsageProvider() });
  const names = ["transfer", "high-value", "vault-deposit", "swap", "sanctioned", "unknown-contract", "unlimited-approval"];
  const api = process.argv.includes("--http");
  const requestOnly = process.argv.indexOf("--request");
  if (requestOnly >= 0) {
    console.log(JSON.stringify(demoRequest(process.argv[requestOnly + 1] ?? "transfer"), null, 2));
    return;
  }
  const key = process.env.COMPLIANCE_API_KEY;
  if (api && !key) throw new Error("Set COMPLIANCE_API_KEY before running the HTTP demo");
  console.log("DEMO fixtures only: no wallet keys, MPC, contract deployment or real sanctions/simulation calls.");
  console.log(`Account ${DEMO.account}, chain ${DEMO.chainId}\n`);
  for (const name of names) {
    const request = demoRequest(name);
    const receipt = api ? await fetch(`${process.env.COMPLIANCE_BASE_URL ?? "http://127.0.0.1:3000"}/api/compliance/evaluate`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "X-Compliance-Subject": "demo-claire" },
      body: JSON.stringify(request),
    }).then(async (response) => { if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`); return response.json() }) :
      await engine.evaluate(request, { subject: "demo-claire" });
    console.log(`${name}: ${receipt.decision.status} [${receipt.decision.assurance}]`);
    for (const line of receipt.decision.summary) console.log(`  ${line}`);
    for (const reason of receipt.decision.reasons) console.log(`  ${reason.code}: ${reason.message}`);
    if (!api && receipt.decision.status === "ALLOW") {
      if (!verifyDecision(receipt, { publicKeyPem: signer.publicKeyPem, request, subject: "demo-claire", allowDemo: true,
        policyHash: hashPayload("swissquote-compliance/policy/v1", policy) })) throw new Error("Decision verification failed");
    }
  }
  if (!api) console.log(`\nSigned decisions verified; ${audit.records.length} audit records; hash chain valid: ${verifyAuditRecords(audit.records)}.`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 });
