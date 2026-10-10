import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPayload } from "../../lib/compliance/canonical";
import { demoRequest } from "../../services/compliance/demo";
import { Ed25519DecisionSigner, verifyDecision } from "../../services/compliance/signing";
import { NOW, testEngine } from "./helpers";

async function signedExample(name = "transfer") {
  const { engine, signer, policy } = testEngine();
  const request = demoRequest(name);
  const receipt = await engine.evaluate(request, { subject: "claire" });
  const options = { publicKeyPem: signer.publicKeyPem, request, subject: "claire", now: NOW, allowDemo: true,
    policyHash: hashPayload("swissquote-compliance/policy/v1", policy) };
  return { receipt, options };
}
test("valid receipt authorizes the identical intent with a pinned key", async () => {
  const { receipt, options } = await signedExample();
  assert.equal(verifyDecision(receipt, options), true);
});
test("signature prevents status, summary, evidence and expiry tampering", async () => {
  const { receipt, options } = await signedExample();
  for (const property of ["status", "summary", "expiresAt", "policyHash"] as const) {
    const copy = structuredClone(receipt);
    if (property === "summary") copy.decision.summary = ["Attacker controls the explanation"];
    else if (property === "status") copy.decision.status = "STEP_UP";
    else copy.decision[property] = "changed" as `0x${string}`;
    assert.equal(verifyDecision(copy, options), false);
  }
});
test("receipt cannot be reused with another nonce, user, policy or key", async () => {
  const { receipt, options } = await signedExample();
  for (const changed of [{ ...options, request: { ...options.request, nonce: "1" } }, { ...options, subject: "someone-else" },
    { ...options, policyHash: "changed" }, { ...options, publicKeyPem: new Ed25519DecisionSigner().publicKeyPem }]) {
    assert.equal(verifyDecision(receipt, changed), false);
  }
});
test("expired, not-yet-issued and demo receipts are rejected by default", async () => {
  const { receipt, options } = await signedExample();
  assert.equal(verifyDecision(receipt, { ...options, now: new Date(NOW.getTime() + 121_000) }), false);
  assert.equal(verifyDecision(receipt, { ...options, now: new Date(NOW.getTime() - 10_000) }), false);
  assert.equal(verifyDecision(receipt, { ...options, allowDemo: false }), false);
});
test("STEP_UP requires the host to attest completed extra authentication", async () => {
  const { receipt, options } = await signedExample("high-value");
  assert.equal(verifyDecision(receipt, options), false);
  assert.equal(verifyDecision(receipt, { ...options, allowStepUp: true }), true);
});
test("a signed refusal never authorizes signing", async () => {
  const { receipt, options } = await signedExample("sanctioned");
  assert.equal(verifyDecision(receipt, { ...options, allowStepUp: true }), false);
});
