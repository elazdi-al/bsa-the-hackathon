import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeFunctionData, erc20Abi, maxUint256 } from "viem";
import { buildVaultCall, decisionAllowsSigning, needsApproval, parseVaultAmount, vaultReadAbi, type VaultQuote } from "../../lib/dapps/model";
import { selectVaults } from "../../lib/dapps/registry";
import { parsePolicy } from "../../lib/compliance/schema";
import { demoPolicy, DEMO } from "../../services/compliance/demo";
import { localDappPolicy, LOCAL_VAULT_ORIGIN } from "../../services/dapps/local-policy";
import { testEngine, NOW } from "../compliance/helpers";

const vault = selectVaults(demoPolicy(), DEMO.chainId)[0];
test("catalogue is restricted to the wallet chain and reviewed ERC-4626 entries", () => {
  assert.equal(selectVaults(demoPolicy(), 31337).length, 0);
  assert.equal(vault.address, DEMO.vault);
  assert.deepEqual(vault.actions, ["deposit", "withdraw", "revoke"]);
  assert.equal(vault.asset.address, DEMO.usdc);
});
test("deposit and revoke disappear without a reviewed spender, token function or shared origin", () => {
  for (const remove of ["spender", "function", "origin"]) {
    const policy = demoPolicy();
    if (remove === "spender") policy.tokens[0].approvedSpenders = [];
    if (remove === "function") policy.contracts[0].allowedFunctions = ["transfer"];
    if (remove === "origin") policy.contracts[0].origins = [];
    assert.deepEqual(selectVaults(policy, DEMO.chainId)[0].actions, ["withdraw"]);
  }
});
test("unconfigured origin makes the vault unavailable", () => {
  const policy = demoPolicy();
  policy.contracts[1].origins = [];
  const disabled = selectVaults(policy, DEMO.chainId)[0];
  assert.equal(disabled.available, false);
  assert.throws(() => buildVaultCall(disabled, DEMO.account, "withdraw", 1n));
});
test("amounts use exact base units and reject rounding, exponents, negatives and zero", () => {
  assert.equal(parseVaultAmount("25.000001", 6), 25_000_001n);
  assert.equal(parseVaultAmount("10000000000000000.1", 6), 10000000000000000100000n);
  for (const value of ["25.0000001", "1e3", "-1", "0", "", ".5", "Infinity"]) assert.throws(() => parseVaultAmount(value, 6));
});
test("approval grants exactly the chosen amount; revoke always sets zero", () => {
  const approve = buildVaultCall(vault, DEMO.account, "approve", 25_000_000n);
  assert.equal(approve.to, DEMO.usdc);
  assert.deepEqual(decodeFunctionData({ abi: erc20Abi, data: approve.data }).args, [DEMO.vault, 25_000_000n]);
  const revoke = buildVaultCall(vault, DEMO.account, "revoke", 0n);
  assert.deepEqual(decodeFunctionData({ abi: erc20Abi, data: revoke.data }).args, [DEMO.vault, 0n]);
  assert.throws(() => buildVaultCall(vault, DEMO.account, "approve", maxUint256));
});
test("deposit and withdrawal fix receiver and owner to this wallet", () => {
  assert.deepEqual(decodeFunctionData({ abi: vaultReadAbi, data: buildVaultCall(vault, DEMO.account, "deposit", 25n).data }).args, [25n, DEMO.account]);
  assert.deepEqual(decodeFunctionData({ abi: vaultReadAbi, data: buildVaultCall(vault, DEMO.account, "withdraw", 10n).data }).args, [10n, DEMO.account, DEMO.account]);
});
test("approval is a separate step only when the chain allowance is insufficient", () => {
  const quote = { action: "deposit", amount: "25", snapshot: { allowance: "24" } } as VaultQuote;
  assert.equal(needsApproval(quote), true);
  quote.snapshot.allowance = "25";
  assert.equal(needsApproval(quote), false);
  quote.action = "withdraw";
  assert.equal(needsApproval(quote), false);
});
test("fresh local deployments register only their actual token and vault", () => {
  const policy = localDappPolicy(DEMO.usdc, DEMO.vault);
  const local = selectVaults(policy, 31337)[0];
  assert.equal(local.origin, LOCAL_VAULT_ORIGIN);
  assert.equal(local.address, DEMO.vault);
  assert.equal(selectVaults(localDappPolicy(DEMO.usdc), 31337).length, 0);
});
test("each separate approval, deposit, withdrawal and revocation is evaluated", async () => {
  const { engine } = testEngine();
  for (const step of ["approve", "deposit", "withdraw", "revoke"] as const) {
    const call = buildVaultCall(vault, DEMO.account, step, step === "revoke" ? 0n : 25_000_000n);
    const { decision } = await engine.evaluate({ requestId: step, nonce: step, account: DEMO.account, chainId: DEMO.chainId,
      dapp: { origin: vault.origin }, calls: [call] }, { subject: DEMO.account });
    assert.equal(decision.status, "ALLOW", JSON.stringify(decision.reasons));
    assert.equal(decisionAllowsSigning(decision, NOW.getTime()), true);
    assert.equal(decisionAllowsSigning(decision, Date.parse(decision.expiresAt)), false);
  }
});
test("unlisted origins do not authorize signing", async () => {
  const { engine } = testEngine();
  const call = buildVaultCall(vault, DEMO.account, "approve", 2_000_000_000n);
  const request = { requestId: "unlisted", nonce: "1", account: DEMO.account, chainId: DEMO.chainId, dapp: { origin: "https://unlisted.example" }, calls: [call] };
  const denied = (await engine.evaluate(request, { subject: DEMO.account })).decision;
  assert.equal(denied.status, "DENY_ASSISTANCE");
  assert.equal(decisionAllowsSigning(denied, NOW.getTime()), false);
  assert.ok(denied.reasons.some((reason) => reason.code === "DAPP_ORIGIN_NOT_APPROVED"));
});
test("unsupported token decimals remain a policy validation error", () => {
  const policy = demoPolicy(); policy.tokens[0].decimals = 80;
  assert.throws(() => parsePolicy(policy));
});
