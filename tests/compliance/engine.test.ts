import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeFunctionData, parseAbi, type Address } from "viem";
import { hashRequest } from "../../lib/compliance/canonical";
import { erc20Abi, vaultAbi } from "../../lib/compliance/decode";
import { parsePolicy, parseRequest } from "../../lib/compliance/schema";
import { DEMO, demoPolicy, demoRequest } from "../../services/compliance/demo";
import { NOW, testEngine } from "./helpers";

const context = { subject: "claire" };
for (const [name, status, code] of [
  ["transfer", "ALLOW", undefined],
  ["vault-deposit", "ALLOW", undefined], ["sanctioned", "DENY_ASSISTANCE", "SANCTIONS_MATCH"],
  ["unknown-contract", "DENY_ASSISTANCE", "CONTRACT_NOT_APPROVED"],
  ["unlimited-approval", "DENY_ASSISTANCE", "UNLIMITED_APPROVAL"],
] as const) {
  test(`demo: ${name} -> ${status}`, async () => {
    const { engine, audit } = testEngine();
    const { decision } = await engine.evaluate(demoRequest(name), context);
    assert.equal(decision.status, status);
    assert.equal(decision.assurance, "DEMO");
    if (code) assert.ok(decision.reasons.some((reason) => reason.code === code));
    assert.equal(audit.records.length, 1);
  });
}
test("nested transfer recipient and account are screened", async () => {
  const calls: string[] = [];
  const { engine } = testEngine({ screening: { async screen(addresses) {
    calls.push(...addresses);
    return addresses.map((address) => ({ address, provider: "test", mode: "demo" as const, status: "CLEAR" as const, checkedAt: NOW.toISOString(), coverage: [] }));
  } } });
  await engine.evaluate(demoRequest("transfer"), context);
  assert.ok(calls.includes(DEMO.account) && calls.includes(DEMO.recipient) && calls.includes(DEMO.usdc));
});
test("request hash normalizes address casing and defaults but binds nonce, amount, chain and operation hash", () => {
  const original = demoRequest("transfer");
  const changedCase = structuredClone(original);
  changedCase.account = ("0x" + original.account.slice(2).toUpperCase()) as Address;
  assert.equal(hashRequest(original), hashRequest(changedCase));
  for (const changed of [ { ...original, nonce: "1" }, { ...original, chainId: 1 },
    { ...original, operationHash: "0x" + "ab".repeat(32) }, { ...original, calls: [{ ...original.calls[0], value: "1" }] } ]) {
    assert.notEqual(hashRequest(original), hashRequest(changed));
  }
});
test("input rejects unknown fields, negative amounts and malformed calldata", () => {
  const original = demoRequest("transfer");
  assert.throws(() => parseRequest({ ...original, customerId: "forged" }));
  assert.throws(() => parseRequest({ ...original, calls: [{ ...original.calls[0], value: "-1" }] }));
  assert.throws(() => parseRequest({ ...original, calls: [{ ...original.calls[0], data: "0xabc" }] }));
});
test("unsupported chain refuses assistance without calling providers", async () => {
  const { engine } = testEngine({ screening: { screen() { throw new Error("must not run") } } });
  const result = await engine.evaluate({ ...demoRequest("transfer"), chainId: 1 }, context);
  assert.equal(result.decision.status, "DENY_ASSISTANCE");
});
test("dApp label cannot override an unknown origin", async () => {
  const { engine } = testEngine();
  const result = await engine.evaluate({ ...demoRequest("transfer"), dapp: { name: "Swissquote", origin: "https://attacker.example" } }, context);
  assert.ok(result.decision.reasons.some((reason) => reason.code === "DAPP_ORIGIN_NOT_APPROVED"));
});
test("unknown selector and trailing calldata are refused", async () => {
  const { engine } = testEngine();
  const original = demoRequest("transfer");
  for (const data of ["0xdeadbeef", original.calls[0].data + "00"]) {
    assert.equal((await engine.evaluate({ ...original, calls: [{ ...original.calls[0], data }] }, context)).decision.status, "DENY_ASSISTANCE");
  }
});
test("delegatecall and account management are refused without a Safe dependency", async () => {
  const { engine } = testEngine();
  const original = demoRequest("transfer");
  const admin = encodeFunctionData({ abi: parseAbi(["function enableModule(address module)"]), functionName: "enableModule", args: [DEMO.unknown] });
  for (const calls of [ [{ ...original.calls[0], operation: "DELEGATECALL" }], [{ ...original.calls[0], data: admin }], [{ ...original.calls[0], to: DEMO.account }] ]) {
    assert.equal((await engine.evaluate({ ...original, calls }, context)).decision.status, "DENY_ASSISTANCE");
  }
});
test("unknown spender is refused; revoking permission is allowed", async () => {
  const { engine } = testEngine();
  const original = demoRequest("transfer");
  for (const [amount, status] of [[1n, "DENY_ASSISTANCE"], [0n, "ALLOW"]] as const) {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [DEMO.unknown, amount] });
    assert.equal((await engine.evaluate({ ...original, calls: [{ ...original.calls[0], data }] }, context)).decision.status, status);
  }
});
test("vault deposit to someone else and withdrawal with another owner are refused", async () => {
  const { engine } = testEngine();
  const original = demoRequest("transfer");
  const deposit = encodeFunctionData({ abi: vaultAbi, functionName: "deposit", args: [10n, DEMO.unknown] });
  const withdraw = encodeFunctionData({ abi: vaultAbi, functionName: "withdraw", args: [10n, DEMO.account, DEMO.unknown] });
  for (const data of [deposit, withdraw]) assert.equal((await engine.evaluate({ ...original, calls: [{ to: DEMO.vault, data }] }, context)).decision.status, "DENY_ASSISTANCE");
});
test("policy configuration rejects duplicate addresses and invalid vault assets", () => {
  const policy = demoPolicy();
  assert.throws(() => parsePolicy({ ...policy, tokens: [...policy.tokens, policy.tokens[0]] }));
  assert.throws(() => parsePolicy({ ...policy, contracts: [policy.contracts[0], { ...policy.contracts[1], asset: DEMO.unknown }] }));
});
test("screening exceptions, partial responses and stale evidence require review", async () => {
  for (const screening of [
    { async screen() { throw new Error("offline") } },
    { async screen() { return [] } },
    { async screen(addresses: Address[]) { return addresses.map((address) => ({ address, status: "CLEAR" as const, mode: "demo" as const, provider: "stale", coverage: [], checkedAt: "2026-01-01T00:00:00Z" })) } },
  ]) assert.equal((await testEngine({ screening }).engine.evaluate(demoRequest("transfer"), context)).decision.status, "REVIEW");
});
test("simulation outage requires review and revert refuses assistance", async () => {
  assert.equal((await testEngine({ simulation: { async simulate() { throw new Error("offline") } } }).engine.evaluate(demoRequest("transfer"), context)).decision.status, "REVIEW");
  const base = testEngine();
  const { engine } = testEngine({ simulation: { async simulate(request, actions) {
    return { ...await base.simulation.simulate(request, actions), status: "REVERTED" };
  } } });
  assert.equal((await engine.evaluate(demoRequest("transfer"), context)).decision.status, "DENY_ASSISTANCE");
});
test("unexpected asset loss and recipient are refused even with the expected net amount", async () => {
  const base = testEngine();
  for (const attack of ["asset", "recipient"]) {
    const { engine } = testEngine({ simulation: { async simulate(request, actions) {
      const result = await base.simulation.simulate(request, actions);
      if (attack === "asset") result.assetChanges.push({ asset: DEMO.unknown, amount: "-1" });
      else result.transfers = result.transfers.map((item) => ({ ...item, to: DEMO.unknown }));
      return result;
    } } });
    assert.equal((await engine.evaluate(demoRequest("transfer"), context)).decision.status, "DENY_ASSISTANCE");
  }
});
test("no asset-change coverage requires review; unrequested approval refuses assistance", async () => {
  const base = testEngine();
  for (const attack of ["missing", "approval"]) {
    const { engine } = testEngine({ simulation: { async simulate(request, actions) {
      const result = await base.simulation.simulate(request, actions);
      if (attack === "missing") result.assetChanges = [];
      else result.approvalChanges.push({ token: DEMO.usdc, owner: request.account, spender: DEMO.unknown, amount: "100" });
      return result;
    } } });
    assert.equal((await engine.evaluate(demoRequest("transfer"), context)).decision.status, attack === "missing" ? "REVIEW" : "DENY_ASSISTANCE");
  }
});
test("additional simulated counterparties are screened", async () => {
  const base = testEngine();
  const { engine } = testEngine({ simulation: { async simulate(request, actions) {
    return { ...await base.simulation.simulate(request, actions), touchedAddresses: [DEMO.sanctioned] };
  } } });
  assert.ok((await engine.evaluate(demoRequest("transfer"), context)).decision.reasons.some((reason) => reason.code === "SANCTIONS_MATCH"));
});
test("no amount is capped or held, in one payment or a batch", async () => {
  const original = demoRequest("transfer");
  const transfer = (amount: bigint) => ({ ...original.calls[0], data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [DEMO.recipient, amount] }) });
  const { engine } = testEngine();
  assert.equal((await engine.evaluate({ ...original, calls: [transfer(600_000_000n), transfer(600_000_000n)] }, context)).decision.status, "ALLOW");
  assert.equal((await engine.evaluate({ ...original, calls: [transfer(1_000_000_000_000n)] }, context)).decision.status, "ALLOW");
});
test("demo providers in live mode cannot produce ALLOW", async () => {
  assert.equal((await testEngine({ mode: "live" }).engine.evaluate(demoRequest("transfer"), context)).decision.status, "REVIEW");
});
test("audit write failure never returns an authorizing decision", async () => {
  const { engine } = testEngine({ audit: { async append() { throw new Error("disk full") } } });
  await assert.rejects(engine.evaluate(demoRequest("transfer"), context), /disk full/);
});

test("the engine's normalized policy is immutable", () => {
  const { engine, policy } = testEngine();
  policy.tokens[0].symbol = "X";
  assert.notEqual(engine.policy.tokens[0].symbol, "X");
  assert.throws(() => engine.policy.tokens.push(policy.tokens[0]));
});

test("stale simulation and missing gross transfer evidence require review", async () => {
  const base = testEngine();
  for (const incomplete of ["stale", "transfers"]) {
    const { engine } = testEngine({ simulation: { async simulate(request, actions) {
      const result = await base.simulation.simulate(request, actions);
      if (incomplete === "stale") result.checkedAt = "2026-01-01T00:00:00Z";
      else result.transfers = [];
      return result;
    } } });
    assert.equal((await engine.evaluate(demoRequest("transfer"), context)).decision.status, "REVIEW");
  }
});

test("vault withdraw and redeem verify underlying asset reaches the requested recipient", async () => {
  for (const functionName of ["withdraw", "redeem"] as const) {
    const request = { ...demoRequest("transfer"), calls: [{ to: DEMO.vault,
      data: encodeFunctionData({ abi: vaultAbi, functionName, args: [20_000_000n, DEMO.recipient, DEMO.account] }) }] };
    const base = testEngine();
    assert.equal((await base.engine.evaluate(request, context)).decision.status, "ALLOW");
    const { engine } = testEngine({ simulation: { async simulate(input, actions) {
      const result = await base.simulation.simulate(input, actions);
      result.transfers = result.transfers.filter((transfer) => transfer.from === DEMO.account);
      return result;
    } } });
    assert.equal((await engine.evaluate(request, context)).decision.status, "REVIEW");
  }
});
