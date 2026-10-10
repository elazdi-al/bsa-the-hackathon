// The protocol end to end against `npm run local`, with phones simulated in Node through the
// app's own phone module: create a wallet, send, get refused, lose the phone, cancel recoveries
// both ways, recover after the 48-hour delay and send from the new phone.
//
//   npm run e2e
import assert from "node:assert/strict";
import { erc20Abi, formatUnits, numberToHex, parseUnits, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress } from "viem/accounts";
import { bindRecoveryKeyMessage } from "../lib/wallet/account.ts";
import { addresses, publicClient } from "../lib/wallet/env.ts";
import { ApiError } from "../lib/wallet/phone.ts";
import { APP, mintUsdc, newPhone } from "./software-phone.ts";

const ANNA = privateKeyToAddress(generatePrivateKey());
const SANCTIONED: Address = "0x098B716B8Aaf21512996dC57EB0615e2383E2f96"; // flagged by the compliance demo screening

const shareRequests: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  if (String(input).endsWith("/share")) shareRequests.push(String(input));
  return realFetch(input, init);
};

async function refused(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  assert.ok(error instanceof ApiError && error.status === status, `expected ${status}, got ${error}`);
  return error.body;
}

const usdcOf = (owner: Address) => publicClient.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [owner] });

console.log("1. Create: passkey, 2-of-3 Shamir split (A phone, B Swissquote, C partner), recovery key");
const phone = newPhone();
await phone.splitKey(await phone.createPasskey());
assert.ok("sealed" in phone.device()!.share, "Share A is sealed under the passkey's PRF output");
const recoveryKey = phone.createRecoveryKey();
const wallet = await phone.register(recoveryKey.address);
console.log(`   wallet ${wallet}`);
const attacker = privateKeyToAccount(generatePrivateKey());
const hijack = await realFetch(`${APP}/api/wallets`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    signer: phone.device()!.signer,
    recoveryKey: attacker.address,
    signature: await attacker.signMessage({ message: bindRecoveryKeyMessage(phone.device()!.signer, attacker.address) }),
  }),
});
assert.equal(hijack.status, 403, "only the wallet key can name its recovery key");
await mintUsdc(wallet, "100");

console.log("2. Send 20 USDC: deploys the account, Face ID + the key cached since the split");
await phone.sendUsdc(ANNA, "20");
assert.equal(await usdcOf(ANNA), parseUnits("20", 6));
assert.equal(shareRequests.length, 0, "the key made at the split is still cached");

console.log("3. Cache expired or app reopened: one Face ID unlocks Share B, then the key is cached again");
phone.forgetKey();
await phone.sendUsdc(ANNA, "1");
await phone.sendUsdc(ANNA, "1");
assert.equal(shareRequests.length, 1, "B is fetched once, then the rebuilt key is reused");

console.log("4. Swissquote refuses to sponsor a sanctioned recipient or an amount that needs step-up");
for (const [to, amount] of [[SANCTIONED, "1"], [ANNA, "2000"]] as const) {
  const { decision } = (await refused(phone.sendUsdc(to, amount), 403)) as { decision: { status: string; reasons: string[] } };
  console.log(`   ${amount} USDC: ${decision.status}, ${decision.reasons.join(" ")}`);
}

console.log("5. Lose the phone. New phone: ID check, new passkey and split; the recovery key signs, B and C rebuild the old key on the new phone");
const newOne = newPhone();
const identity = { document: "id-card-scan", selfie: "selfie" };
await newOne.splitKey(await newOne.createPasskey());
const started = await newOne.startRecovery(recoveryKey.secret, identity);
assert.equal(started.address, wallet);
const now = Number((await publicClient.getBlock()).timestamp);
assert.ok(started.executeAfter >= now + 48 * 3600 - 5, "the delay is 48 hours");
console.log(`   recovery pending until ${new Date(started.executeAfter * 1000).toISOString()}`);

console.log("6. The old phone cancels it from the app (passkey + key)");
await phone.cancelRecovery();
assert.equal((await phone.state()).pendingRecovery, null);

console.log("7. Started again, Swissquote cancels it for the client as guardian");
await newOne.startRecovery(recoveryKey.secret, identity);
await newOne.cancelRecoveryWithSwissquote(recoveryKey.secret);
assert.equal((await newOne.state()).pendingRecovery, null);

console.log("8. Started again: finalizing before 48 hours fails, after it succeeds");
await newOne.startRecovery(recoveryKey.secret, identity);
await refused(newOne.finalizeRecovery(), 409);
await publicClient.request({ method: "evm_increaseTime", params: [numberToHex(48 * 3600)] } as never);
await publicClient.request({ method: "evm_mine", params: [] } as never);
await newOne.finalizeRecovery();
const state = await newOne.state();
assert.equal(state.signer, newOne.device()!.signer);
assert.equal(state.address, wallet);

console.log("9. New phone sends 5 USDC from the same address; the old phone's credentials are dead");
await newOne.sendUsdc(ANNA, "5");
await refused(phone.sendUsdc(ANNA, "1"), 422);
console.log(`   Anna has ${formatUnits(await usdcOf(ANNA), 6)} USDC, the wallet ${formatUnits(await usdcOf(wallet), 6)} USDC`);
assert.equal(await usdcOf(ANNA), parseUnits("27", 6));
console.log("All good.");
