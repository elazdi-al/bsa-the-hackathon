// Real local-chain calls through the existing wallet backend. No public-network writes.
import assert from "node:assert/strict";
import { erc20Abi, maxUint256, encodeFunctionData, type Address } from "viem";
import { buildVaultCall, needsApproval, vaultReadAbi } from "../lib/dapps/model";
import { chain, publicClient } from "../lib/wallet/env";
import { ApiError } from "../lib/wallet/phone";
import { APP, mintUsdc, newPhone } from "./software-phone";

assert.equal(chain.id, 31337, "Run this mutation test only against the isolated local chain.");
const phone = newPhone();
await phone.splitKey(await phone.createPasskey());
const recovery = phone.createRecoveryKey();
const wallet = await phone.register(recovery.address);
// Linked, so Swissquote pays its gas: an unlinked wallet pays its own in ETH.
await phone.link(await phone.signIn());
await mintUsdc(wallet, "3000");
const catalog = await phone.dapps();
const vault = catalog.vaults.find((item) => item.available)!;
assert.ok(vault, "No deployed reviewed vault. Start a fresh stack with the vault policy.");
const metadata = { origin: vault.origin, name: vault.name };
async function refused(task: Promise<unknown>, status: number, expectedDecision?: string) {
  const error = await task.then(() => undefined, (error: unknown) => error);
  assert.ok(error instanceof ApiError, String(error));
  assert.equal(error.status, status);
  if (expectedDecision) assert.equal((error.body.review as { status: string }).status, expectedDecision);
}
async function execute(step: "approve" | "deposit" | "withdraw" | "revoke", amount: bigint) {
  const prepared = await phone.prepare(buildVaultCall(vault, wallet, step, amount), metadata);
  assert.equal(prepared.review?.status, "ALLOW");
  assert.ok(prepared.expiresAt);
  const { transactionHash: hash } = await phone.approve(prepared);
  assert.equal((await publicClient.getTransactionReceipt({ hash })).status, "success");
  console.log(`   ${step}: ${hash}`);
  return hash;
}

console.log("1. Policy refusals never authorize dApp signing");
await refused(phone.prepare(buildVaultCall(vault, wallet, "approve", 25_000_000n), { origin: "https://unlisted.example" }), 403, "DENY_ASSISTANCE");
await refused(phone.prepare({ to: vault.asset.address, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault.address, maxUint256] }) }, metadata), 403, "DENY_ASSISTANCE");
const unknown: Address = "0x3333333333333333333333333333333333333333";
const outside = await fetch(`${APP}/api/wallets/${wallet}/dapps/${unknown}`);
assert.equal(outside.status, 403);
const badAmount = await fetch(`${APP}/api/wallets/${wallet}/dapps/${vault.address}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "deposit", amount: "-1" }),
});
assert.equal(badAmount.status, 400);
const injectedNetwork = await fetch(`${APP}/api/wallets/${wallet}/operations`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ callData: "0x", dapp: metadata, chainId: 1, subject: "another-client" }),
});
assert.equal(injectedNetwork.status, 400, "browser cannot inject the chain or bank subject");

console.log("2. Exact approval is separate from deposit, both sponsored with the wallet's passkey");
assert.equal(needsApproval(await phone.quoteVault(vault.address, "deposit", 25_000_000n)), true);
const firstApproval = await execute("approve", 25_000_000n);
let state = await phone.vaultSnapshot(vault.address, firstApproval);
assert.ok(BigInt(state.blockNumber) >= (await publicClient.getTransactionReceipt({ hash: firstApproval })).blockNumber);
assert.equal(state.allowance, "25000000");
assert.equal(state.assetBalance, "3000000000", "approval alone moves no funds");
assert.equal(state.shareBalance, "0");
assert.equal(needsApproval(await phone.quoteVault(vault.address, "deposit", 25_000_000n)), false);
await execute("deposit", 25_000_000n);
state = await phone.vaultSnapshot(vault.address);
assert.equal(state.allowance, "0");
assert.equal(state.shareBalance, "25000000");
assert.equal(state.assetBalance, "2975000000");

console.log("3. Withdrawal returns assets to this wallet; over-withdrawal fails before signing");
await refused(phone.quoteVault(vault.address, "withdraw", 26_000_000n), 409);
await execute("withdraw", 10_000_000n);
state = await phone.vaultSnapshot(vault.address);
assert.equal(state.assetBalance, "2985000000");
assert.equal(state.shareBalance, "15000000");

console.log("4. An interrupted deposit leaves a visible allowance which the client can revoke");
const secondApproval = await execute("approve", 7_000_000n);
assert.equal((await phone.vaultSnapshot(vault.address, secondApproval)).allowance, "7000000");
await execute("revoke", 0n);
assert.equal((await phone.vaultSnapshot(vault.address)).allowance, "0");
assert.equal(await publicClient.getBalance({ address: wallet }), 0n, "wallet never acquired native gas tokens");
assert.equal(await publicClient.readContract({ address: vault.address, abi: vaultReadAbi, functionName: "balanceOf", args: [wallet] }), 15_000_000n);
console.log("dApp API end-to-end checks passed.");
