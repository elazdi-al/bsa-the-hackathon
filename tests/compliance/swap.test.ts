import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeFunctionData, parseUnits, type Address } from "viem";
import { erc20Abi, swapAbi } from "../../lib/compliance/decode";
import { parsePolicy } from "../../lib/compliance/schema";
import type { ComplianceDecision, ComplianceRequest } from "../../lib/compliance/types";
import { DEMO, demoPolicy, demoRequest } from "../../services/compliance/demo";
import { testEngine } from "./helpers";

const context = { subject: "claire" };
const usdc = (amount: string) => parseUnits(amount, 6);
const weth = (amount: string) => parseUnits(amount, 18);
const approve = (token: Address, amount: bigint, spender: Address = DEMO.pool) =>
  ({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] }) });
const swap = (tokenIn: Address, amountIn: bigint, minOut: bigint) =>
  ({ to: DEMO.pool, data: encodeFunctionData({ abi: swapAbi, functionName: "swap", args: [tokenIn, amountIn, minOut] }) });
const pair = (tokenIn: Address, amountIn: bigint, minOut: bigint) => [approve(tokenIn, amountIn), swap(tokenIn, amountIn, minOut)];
const codes = (decision: ComplianceDecision) => decision.reasons.map((reason) => reason.code);
async function evaluate(calls: Array<Partial<ComplianceRequest["calls"][number]>>, overrides: Parameters<typeof testEngine>[0] = {}) {
  return (await testEngine(overrides).engine.evaluate({ ...demoRequest("swap"), calls }, context)).decision;
}

test("a reviewed USDC to WETH swap batch is allowed and decoded", async () => {
  const decision = await evaluate(demoRequest("swap").calls);
  assert.equal(decision.status, "ALLOW");
  assert.deepEqual(decision.summary, [
    `Set ${DEMO.pool}'s spending permission to 100 USDC.`,
    "Swap 100 USDC for at least 0.0396 WETH on Demo swap pool.",
  ]);
  const action = decision.decodedActions[1];
  assert.equal(action.type, "SWAP");
  assert.deepEqual(action.debit, { asset: DEMO.usdc, amount: "100000000" });
  assert.equal(action.creditAsset, DEMO.weth);
  assert.equal(action.minCreditAmount, "39600000000000000");
  assert.equal(action.recipient, DEMO.account);
  assert.deepEqual(action.addresses, [DEMO.pool, DEMO.usdc, DEMO.weth]);
  assert.deepEqual(decision.simulation.transfers, [
    { asset: DEMO.usdc, from: DEMO.account, to: DEMO.pool, amount: "100000000" },
    { asset: DEMO.weth, from: DEMO.pool, to: DEMO.account, amount: "39600000000000000" },
  ]);
  assert.deepEqual(decision.simulation.approvalChanges.map((change) => change.amount), ["100000000", "0"]);
});

test("the reverse WETH to USDC swap is allowed", async () => {
  const decision = await evaluate(pair(DEMO.weth, weth("0.04"), usdc("99")));
  assert.equal(decision.status, "ALLOW");
  assert.equal(decision.summary[1], "Swap 0.04 WETH for at least 99 USDC on Demo swap pool.");
});

for (const [name, calls, expected] of [
  ["an input token outside the pair", [approve(DEMO.usdc, 100n), swap(DEMO.vault, 100n, 1n)], ["SWAP_TOKEN_NOT_IN_PAIR", "SWAP_APPROVAL_UNUSED"]],
  ["a zero input", [approve(DEMO.usdc, 0n), swap(DEMO.usdc, 0n, 1n)], ["SWAP_ZERO_AMOUNT"]],
  ["a zero minimum output", [approve(DEMO.usdc, 100n), swap(DEMO.usdc, 100n, 0n)], ["SWAP_UNBOUNDED_SLIPPAGE", "SWAP_APPROVAL_UNUSED"]],
  ["native value", [approve(DEMO.usdc, 100n), { ...swap(DEMO.usdc, 100n, 1n), value: "1" }], ["UNEXPECTED_NATIVE_VALUE", "SWAP_APPROVAL_UNUSED"]],
  ["no approval", [swap(DEMO.usdc, 100n, 1n)], ["SWAP_APPROVAL_MISSING"]],
  ["an approval below the input", [approve(DEMO.usdc, 99n), swap(DEMO.usdc, 100n, 1n)], ["SWAP_APPROVAL_MISSING", "SWAP_APPROVAL_UNUSED"]],
  ["an approval above the input", [approve(DEMO.usdc, 101n), swap(DEMO.usdc, 100n, 1n)], ["SWAP_APPROVAL_MISSING", "SWAP_APPROVAL_UNUSED"]],
  ["an approval after the swap", [swap(DEMO.usdc, 100n, 1n), approve(DEMO.usdc, 100n)], ["SWAP_APPROVAL_MISSING", "SWAP_APPROVAL_UNUSED"]],
  ["an approval of the other token", [approve(DEMO.weth, 100n), swap(DEMO.usdc, 100n, 1n)], ["SWAP_APPROVAL_MISSING", "SWAP_APPROVAL_UNUSED"]],
  ["one approval spent by two swaps", [...pair(DEMO.usdc, 100n, 1n), swap(DEMO.usdc, 100n, 1n)], ["SWAP_APPROVAL_MISSING"]],
  ["an approval to the pool with no swap", [approve(DEMO.usdc, 100n)], ["SWAP_APPROVAL_UNUSED"]],
] as const) {
  test(`a swap batch with ${name} is refused`, async () => {
    const decision = await evaluate([...calls]);
    assert.equal(decision.status, "DENY_ASSISTANCE");
    assert.deepEqual(codes(decision), expected);
  });
}

test("revoking the pool's permission and approving a vault without depositing keep their behaviour", async () => {
  assert.equal((await evaluate([approve(DEMO.usdc, 0n)])).status, "ALLOW");
  assert.equal((await evaluate([approve(DEMO.usdc, 100n, DEMO.vault)])).status, "ALLOW");
});

test("no swap is capped or held: 2,000 USDC and 0.5 WETH swap at once", async () => {
  for (const calls of [pair(DEMO.usdc, usdc("2000"), weth("0.79")), pair(DEMO.weth, weth("0.5"), usdc("1240"))]) {
    assert.equal((await evaluate(calls)).status, "ALLOW");
  }
});

test("simulation must show the minimum output reaching the account", async () => {
  const base = testEngine();
  const decision = await evaluate(demoRequest("swap").calls, { simulation: { async simulate(request, actions) {
    const result = await base.simulation.simulate(request, actions);
    result.transfers = result.transfers.map((transfer) => transfer.asset === DEMO.weth ? { ...transfer, amount: "39599999999999999" } : transfer);
    return result;
  } } });
  assert.equal(decision.status, "REVIEW");
  assert.deepEqual(codes(decision), ["SWAP_OUTPUT_NOT_CONFIRMED"]);
});

test("a zero allowance is expected only for the pool a swap spent", async () => {
  const base = testEngine();
  const decision = await evaluate(demoRequest("swap").calls, { simulation: { async simulate(request, actions) {
    const result = await base.simulation.simulate(request, actions);
    result.approvalChanges.push({ token: DEMO.usdc, owner: request.account, spender: DEMO.vault, amount: "0" });
    return result;
  } } });
  assert.deepEqual(codes(decision), ["UNEXPECTED_APPROVAL"]);
});

test("a swap pool must trade two distinct registered tokens and only swap", () => {
  const policy = demoPolicy();
  const pool = policy.contracts.find((contract) => contract.kind === "SWAP")!;
  const others = policy.contracts.filter((contract) => contract !== pool);
  for (const changed of [{ tokens: undefined }, { tokens: [DEMO.usdc, DEMO.unknown] }, { tokens: [DEMO.usdc, DEMO.usdc] }, { allowedFunctions: ["swap", "approve"] }]) {
    assert.throws(() => parsePolicy({ ...policy, contracts: [...others, { ...pool, ...changed }] }));
  }
});
