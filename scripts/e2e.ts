// The protocol end to end against `npm run local`, with phones simulated in Node through the
// app's own phone module: create a wallet signed in to Swissquote, send, get refused, refuse an attacker
// with the stolen phone and email, lose the phone, cancel recoveries both ways, have Swissquote lock the
// stolen phone, recover after the 48-hour delay, send from the new phone, and leave without Swissquote.
//
//   npm run e2e
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { P256 } from "ox";
import { encodeFunctionData, erc20Abi, formatUnits, numberToHex, parseUnits, recoverMessageAddress, type Address } from "viem";
import { formatUserOperation, getUserOperationHash } from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress } from "viem/accounts";
import { bindRecoveryKeyMessage, ownershipMessage } from "../lib/wallet/account.ts";
import { addresses, chain, isDeployed, partnerUrl, publicClient } from "../lib/wallet/env.ts";
import { ApiError, softwareAuthenticator } from "../lib/wallet/phone.ts";
import { setSunset } from "../lib/wallet/sunset.ts";
import { attack } from "./attack.ts";
import { APP, mintUsdc, newPhone, sendEth } from "./software-phone.ts";

const ANNA = privateKeyToAddress(generatePrivateKey());
const SANCTIONED: Address = "0x098B716B8Aaf21512996dC57EB0615e2383E2f96"; // flagged by the compliance demo screening

process.on("exit", () => setSunset(false));

const shareRequests: string[] = [];
const exitRequests: string[] = [];
const apiRequests: string[] = [];
let tamper: ((body: any) => any) | undefined;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith("/share")) shareRequests.push(url);
  if (url.startsWith(APP)) apiRequests.push(url);
  if (url === `${partnerUrl}/exit`) {
    exitRequests.push(url);
    if (tamper && init?.method === "POST") init = { ...init, body: JSON.stringify(await tamper(JSON.parse(String(init.body)))) };
  }
  return realFetch(input, init);
};

async function refused(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  assert.ok(error instanceof ApiError && error.status === status, `expected ${status}, got ${error}`);
  return error.body;
}

async function exitRefusal(body: unknown) {
  const res = await realFetch(`${partnerUrl}/exit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(res.status, 400, "the partner refuses this exit");
  return ((await res.json()) as { error: string }).error;
}

const usdcOf = (owner: Address) => publicClient.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [owner] });

console.log("1. Create, signed in to Swissquote (mock): passkey, 2-of-3 Shamir split (A phone, B Swissquote, C partner), recovery key");
const phone = newPhone();
const signedIn = await phone.signIn();
assert.deepEqual(await phone.signIn(signedIn.session), signedIn, "a known session stays signed in as its client");
await phone.splitKey(await phone.createPasskey());
assert.ok("sealed" in phone.device()!.share, "Share A is sealed under the passkey's PRF output");
const recoveryKey = phone.createRecoveryKey();
const wallet = await phone.register(recoveryKey.address, signedIn);
console.log(`   wallet ${wallet}, owned by ${signedIn.client.name}, Swissquote client ${signedIn.client.number}`);
const { owner } = await phone.state();
assert.equal(owner?.client, signedIn.client.number, "Swissquote recorded the client number against the wallet");
assert.equal(owner.statement, ownershipMessage(signedIn.client.number, wallet));
assert.equal(await recoverMessageAddress({ message: owner.statement, signature: owner.signature }), phone.device()!.signer, "the wallet key signed it");
const attacker = privateKeyToAccount(generatePrivateKey());
const hijack = await realFetch(`${APP}/api/wallets`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    signer: phone.device()!.signer,
    recoveryKey: attacker.address,
    signature: await attacker.signMessage({ message: bindRecoveryKeyMessage(phone.device()!.signer, attacker.address) }),
    session: signedIn.session,
    ownership: await attacker.signMessage({ message: ownershipMessage(signedIn.client.number, wallet) }),
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

console.log("5. An attacker with the stolen phone and the email inbox is stopped at every step");
await attack({ phone: structuredClone(phone.device()!), homeKey: recoveryKey.secret });

console.log("6. Lose the phone. New phone: ID check, new passkey and split; the recovery key signs, B and C rebuild the old key on the new phone");
const newOne = newPhone();
// MOCKED: the owner's ID on file stands in for their own ID card and face.
const { idOnFile } = await newOne.findRecovery(recoveryKey.secret);
assert.equal(idOnFile?.name, signedIn.client.name);
const identity = idOnFile;
await newOne.splitKey(await newOne.createPasskey());
const started = await newOne.startRecovery(recoveryKey.secret, identity);
assert.equal(started.address, wallet);
assert.equal(started.signedIn.client.number, signedIn.client.number, "the ID check signs the new phone in as the owner");
const now = Number((await publicClient.getBlock()).timestamp);
assert.ok(started.executeAfter >= now + 48 * 3600 - 5, "the delay is 48 hours");
console.log(`   recovery pending until ${new Date(started.executeAfter * 1000).toISOString()}`);

console.log("7. The old phone cancels it from the app (passkey + key)");
await phone.cancelRecovery();
assert.equal((await phone.state()).pendingRecovery, null);

console.log("8. The client reports the old phone stolen: Swissquote locks its credentials");
const setLock = (method: "POST" | "DELETE") =>
  realFetch(`${APP}/api/wallets/${wallet}/lock`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ identity }) });
const { usdc } = await phone.config();
const prepared = await phone.prepare({ to: usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [ANNA, parseUnits("1", 6)] }) });
assert.equal((await setLock("POST")).status, 200, "locked");
assert.equal((await phone.state()).locked, true);
await refused(phone.sendUsdc(ANNA, "1"), 423);
const shares = shareRequests.length;
await refused(phone.approve(prepared), 423);
assert.equal(shareRequests.length, shares, "the cached key signed; submission refused it");
phone.forgetKey();
await refused(phone.approve(prepared), 423);
assert.equal(shareRequests.length, shares + 1, "Share B refused it");
assert.equal((await setLock("DELETE")).status, 200, "unlocked");
await phone.sendUsdc(ANNA, "1");
assert.equal((await setLock("POST")).status, 200, "locked again");

console.log("9. Started again: the locked phone can't cancel it, Swissquote still cancels it as guardian");
await newOne.startRecovery(recoveryKey.secret, identity);
await refused(phone.cancelRecovery(), 423);
await newOne.cancelRecoveryWithSwissquote(recoveryKey.secret);
assert.equal((await newOne.state()).pendingRecovery, null);

console.log("10. Started again: finalizing before 48 hours fails, after it succeeds");
await newOne.startRecovery(recoveryKey.secret, identity);
await refused(newOne.finalizeRecovery(), 409);
await publicClient.request({ method: "evm_increaseTime", params: [numberToHex(48 * 3600)] } as never);
await publicClient.request({ method: "evm_mine", params: [] } as never);
await newOne.finalizeRecovery();
const state = await newOne.state();
assert.equal(state.signer, newOne.device()!.signer);
assert.equal(state.address, wallet);

console.log("11. The new phone sends 5 USDC with no unlock; the old credentials stay dead");
await newOne.sendUsdc(ANNA, "5");
await refused(phone.sendUsdc(ANNA, "1"), 422);
phone.forgetKey();
await refused(phone.sendUsdc(ANNA, "1"), 403);
assert.equal((await phone.state()).locked, false, "the lock on the old credentials no longer applies");
assert.equal((await newOne.state()).locked, false);
console.log(`   Anna has ${formatUnits(await usdcOf(ANNA), 6)} USDC, the wallet ${formatUnits(await usdcOf(wallet), 6)} USDC`);
assert.equal(await usdcOf(ANNA), parseUnits("28", 6));

console.log("12. Swissquote's services are closed for good. The client leaves with the money: Face ID, Share A and Share C, gas from the wallet's own ETH");
assert.match(await exitRefusal({}), /running/, "no exit while Swissquote's services run");
const fresh = newPhone();
await fresh.splitKey(await fresh.createPasskey());
const freshWallet = await fresh.register(fresh.createRecoveryKey().address, await fresh.signIn());
await mintUsdc(freshWallet, "10");
setSunset(true);
assert.equal((await realFetch(`${APP}/api/config`)).status, 503, "Swissquote's API is closed");
const deadline = Date.now() + 30_000;
let status = await newOne.exitStatus();
while (!status.open) {
  assert.ok(Date.now() < deadline, `the exit opens within 30 s of Swissquote closing; the partner says ${JSON.stringify(status)}`);
  await sleep(1000);
  status = await newOne.exitStatus();
}
console.log(`   the partner saw Swissquote closed for ${status.closedFor} s, then opened the exit`);
newOne.forgetKey();
const stranger = softwareAuthenticator(P256.randomPrivateKey(), APP);
tamper = async (body) => {
  const userOperation = formatUserOperation(body.userOp);
  const hash = getUserOperationHash({ chainId: chain.id, entryPointAddress: addresses.entryPoint, entryPointVersion: "0.7", userOperation });
  const { metadata, signature } = (await stranger.sign("software", hash)).assertion;
  return { ...body, assertion: { metadata, signature: { r: numberToHex(signature.r), s: numberToHex(signature.s) } } };
};
assert.match(String((await refused(newOne.exitUsdc(ANNA, "1"), 400)).error), /passkey/, "a stranger's passkey does not release Share C");
tamper = (body) => ({
  ...body,
  userOp: { ...body.userOp, paymaster: addresses.paymaster, paymasterData: "0x", paymasterVerificationGasLimit: "0x186a0", paymasterPostOpGasLimit: "0x0" },
});
assert.match(String((await refused(newOne.exitUsdc(ANNA, "1"), 400)).error), /paymaster/, "Swissquote's paymaster does not sponsor an exit");
tamper = undefined;
await sendEth(wallet, "0.01");
const exitsBefore = exitRequests.length;
const apiBefore = apiRequests.length;
newOne.forgetKey();
await newOne.exitUsdc(ANNA, formatUnits(await usdcOf(wallet), 6));
assert.equal(await usdcOf(wallet), 0n, "the whole balance left the wallet");
assert.equal(await usdcOf(ANNA), parseUnits("100", 6));
assert.equal(exitRequests.length, exitsBefore + 1, "one Face ID, one request for Share C");
assert.equal(await isDeployed(freshWallet), false, "a wallet that never paid has no account on-chain yet");
await sendEth(freshWallet, "0.01");
fresh.forgetKey();
await fresh.exitUsdc(ANNA, "10");
assert.ok(await isDeployed(freshWallet), "the exit deploys the account on the way out");
assert.equal(await usdcOf(ANNA), parseUnits("110", 6));
assert.equal(exitRequests.length, exitsBefore + 2, "the partner checked the deploying operation's config before releasing C");
assert.deepEqual(apiRequests.slice(apiBefore), [], "neither exit called Swissquote's API");
setSunset(false);
assert.equal((await realFetch(`${APP}/api/config`)).status, 200, "Swissquote's API is back");
assert.match(await exitRefusal({}), /running/, "one successful probe closes the exit at once");
console.log(`   Anna has ${formatUnits(await usdcOf(ANNA), 6)} USDC, both wallets 0; the exit closed again once Swissquote answered`);
console.log("All good.");
