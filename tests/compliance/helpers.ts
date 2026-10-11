import { randomUUID } from "node:crypto";
import { ComplianceEngine, type EngineDependencies } from "../../lib/compliance/engine";
import { demoPolicy, DemoScreeningProvider, DemoSimulationProvider } from "../../services/compliance/demo";
import { MemoryAuditSink } from "../../services/compliance/audit";
import { Ed25519DecisionSigner } from "../../services/compliance/signing";

export const NOW = new Date("2026-10-10T12:00:00.000Z");
export function testEngine(overrides: Partial<EngineDependencies> = {}, policy = demoPolicy()) {
  const signer = new Ed25519DecisionSigner();
  const audit = new MemoryAuditSink();
  const simulation = new DemoSimulationProvider(policy, () => NOW);
  const engine = new ComplianceEngine(policy, { signer, audit, simulation, mode: "demo", now: () => NOW, newId: randomUUID,
    screening: new DemoScreeningProvider(() => NOW), ...overrides });
  return { engine, signer, audit, simulation, policy };
}
