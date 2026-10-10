import assert from "node:assert/strict";
import { test } from "node:test";
import { handleEvaluation, handleKeys, handleRegistry } from "../../services/compliance/http";
import { demoRequest } from "../../services/compliance/demo";
import { testEngine } from "./helpers";

const env = { COMPLIANCE_API_KEY: "server-secret" };
function request(body: unknown = demoRequest("transfer"), headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/compliance/evaluate", { method: "POST", body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Authorization: "Bearer server-secret", "X-Compliance-Subject": "claire", ...headers } });
}
function runtime() { return { ...testEngine(), mode: "demo" as const } }
test("HTTP API returns the typed signed receipt and no-store header", async () => {
  const response = await handleEvaluation(request(), runtime, env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.json()).decision.status, "ALLOW");
});
test("HTTP API authenticates before invoking providers", async () => {
  let called = false;
  const response = await handleEvaluation(request(undefined, { Authorization: "Bearer wrong" }), () => { called = true; return runtime() }, env);
  assert.equal(response.status, 401);
  assert.equal(called, false);
});
test("HTTP API requires server configuration and a trusted subject", async () => {
  assert.equal((await handleEvaluation(request(), runtime, {})).status, 503);
  assert.equal((await handleEvaluation(request(undefined, { "X-Compliance-Subject": "" }), runtime, env)).status, 400);
});
test("malformed input is 400 and oversized or wrong-content-type bodies are rejected", async () => {
  assert.equal((await handleEvaluation(request({ requestId: "invalid" }), runtime, env)).status, 400);
  assert.equal((await handleEvaluation(request("x".repeat(129 * 1024)), runtime, env)).status, 413);
  assert.equal((await handleEvaluation(request(undefined, { "Content-Type": "text/plain" }), runtime, env)).status, 415);
  assert.equal((await handleEvaluation(request(undefined, { "Content-Type": "evilapplication/json" }), runtime, env)).status, 415);
});
test("keys and registry endpoints expose only public data after authentication", async () => {
  const active = runtime();
  const keys = await handleKeys(request(), () => active, env).json();
  assert.ok(keys.publicKeyPem.includes("BEGIN PUBLIC KEY"));
  assert.equal("privateKey" in keys, false);
  const registry = await handleRegistry(request(), () => active, env).json();
  assert.equal(registry.mode, "demo");
  assert.equal(registry.policyHash.length, 66);
});
