import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { FileAuditSink, verifyAuditRecords, type AuditRecord } from "../../services/compliance/audit";
import { demoRequest } from "../../services/compliance/demo";
import { testEngine } from "./helpers";

test("hash chain detects modification and reordering", async () => {
  const { engine, audit } = testEngine();
  await engine.evaluate(demoRequest("transfer"), { subject: "claire" });
  await engine.evaluate(demoRequest("sanctioned"), { subject: "claire" });
  assert.equal(verifyAuditRecords(audit.records), true);
  const changed = structuredClone(audit.records);
  changed[0].receipt.decision.status = "DENY_ASSISTANCE";
  assert.equal(verifyAuditRecords(changed), false);
  assert.equal(verifyAuditRecords([...audit.records].reverse()), false);
});
test("file audit serializes concurrent appends and resumes the chain after restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sq-compliance-test-"));
  try {
    const path = join(directory, "audit.ndjson");
    const { engine } = testEngine();
    const receipt = await engine.evaluate(demoRequest("transfer"), { subject: "claire" });
    const audit = new FileAuditSink(path);
    await Promise.all([audit.append(receipt), audit.append(receipt)]);
    await new FileAuditSink(path).append(receipt);
    const records = (await readFile(path, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as AuditRecord);
    assert.equal(records.length, 3);
    assert.equal(verifyAuditRecords(records), true);
  } finally {
    // Validate the exact mkdtemp target before recursive cleanup on Windows.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("sq-compliance-test-"));
    await rm(directory, { recursive: true });
  }
});
