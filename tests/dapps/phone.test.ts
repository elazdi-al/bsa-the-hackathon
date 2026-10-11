import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeFunctionData, type Hex } from "viem";
import { entryPoint07Address, formatUserOperationRequest, getUserOperationHash, type UserOperation } from "viem/account-abstraction";
import { accountAbi } from "../../lib/wallet/account";
import { createPhone, type Prepared } from "../../lib/wallet/phone";
import { buildVaultCall } from "../../lib/dapps/model";
import { selectVaults } from "../../lib/dapps/registry";
import { demoPolicy, DEMO } from "../../services/compliance/demo";
import { testEngine } from "../compliance/helpers";

const hash: Hex = `0x${"01".repeat(32)}`;
function fixturePhone() {
  let authentications = 0;
  const phone = createPhone({ partner: "https://partner.example", storage: {
    getItem: () => JSON.stringify({ address: DEMO.account, credentialId: "fixture", signer: DEMO.account }), setItem() {}, removeItem() {},
  }, authenticator: { async create() { throw new Error("not used"); }, async sign() { authentications++; throw new Error("not used"); } } });
  return { phone, authentications: () => authentications };
}
test("expired and invalid deadlines are rejected before asking for a passkey", async () => {
  const { phone, authentications } = fixturePhone();
  for (const expiresAt of [new Date(Date.now() - 1000).toISOString(), "invalid"]) {
    await assert.rejects(phone.approve({ hash, userOp: {} as Prepared["userOp"], expiresAt }), /expired/);
  }
  assert.equal(authentications(), 0);
});
test("non-authorizing compliance reviews never ask for a passkey", async () => {
  const { phone, authentications } = fixturePhone();
  const { engine } = testEngine();
  const vault = selectVaults(demoPolicy(), DEMO.chainId)[0];
  const { decision } = await engine.evaluate({ requestId: "review", nonce: "1", account: DEMO.account, chainId: DEMO.chainId,
    dapp: { origin: vault.origin }, calls: [buildVaultCall(vault, DEMO.account, "approve", 2_000_000_000n)] }, { subject: DEMO.account });
  decision.expiresAt = new Date(Date.now() + 60_000).toISOString();
  for (const status of ["STEP_UP", "REVIEW", "DENY_ASSISTANCE"] as const) {
    await assert.rejects(phone.approve({ hash, userOp: {} as Prepared["userOp"], review: { ...decision, status } }), /does not authorize/);
  }
  assert.equal(authentications(), 0);
});
test("phone forwards dApp metadata but rejects altered wallet calldata before signing", async () => {
  const originalFetch = globalThis.fetch;
  const vault = selectVaults(demoPolicy(), DEMO.chainId)[0];
  const call = buildVaultCall(vault, DEMO.account, "approve", 25_000_000n);
  const expected = encodeFunctionData({ abi: accountAbi, functionName: "execute", args: [call.to, 0n, call.data] });
  let tamper = false;
  try {
    globalThis.fetch = async (input, init) => {
      if (String(input) === "/api/config") return Response.json({ chainId: DEMO.chainId, entryPoint: entryPoint07Address, usdc: DEMO.usdc });
      assert.equal(String(input), `/api/wallets/${DEMO.account}/operations`);
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body.dapp, { origin: vault.origin, name: vault.name });
      assert.equal(body.callData, expected);
      const op: UserOperation<"0.7"> = {
        sender: DEMO.account, nonce: 0n, callData: tamper ? "0x1234" : expected, callGasLimit: 300_000n,
        verificationGasLimit: 1_000_000n, preVerificationGas: 50_000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n,
        paymaster: DEMO.recipient, paymasterVerificationGasLimit: 100_000n, paymasterPostOpGasLimit: 0n,
        paymasterData: "0x", signature: "0x",
      };
      return Response.json({ hash: getUserOperationHash({ chainId: DEMO.chainId, entryPointAddress: entryPoint07Address, entryPointVersion: "0.7", userOperation: op }), userOp: formatUserOperationRequest(op) });
    };
    const { phone, authentications } = fixturePhone();
    const metadata = { origin: vault.origin, name: vault.name };
    assert.ok(await phone.prepare(call, metadata));
    tamper = true;
    await assert.rejects(phone.prepare(call, metadata), /different operation/);
    assert.equal(authentications(), 0);
  } finally { globalThis.fetch = originalFetch; }
});
