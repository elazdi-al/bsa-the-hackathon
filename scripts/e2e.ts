// The protocol end to end against `npm run local`, with phones simulated in Node through the
// app's own phone module: create a wallet without a Swissquote account, link it to a Swissquote client, send,
// get refused, have large payments held, cancelled both ways and released after 24 hours, refuse an attacker with
// the stolen phone and email, on the linked wallet and on one never linked, which Swissquote can't lock and which
// the Recovery Key alone recovers, lose the phone, cancel recoveries both ways, have Swissquote lock the stolen
// phone and stop what it held, recover after the 48-hour delay, send from the new phones, refuse to farm
// Swissquote's free gas, and leave without Swissquote.
//
//   npm run e2e
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { P256 } from "ox";
import { encodeFunctionData, erc20Abi, formatUnits, keccak256, numberToHex, parseUnits, toHex, type Address, type Hex } from "viem";
import { entryPoint07Abi, formatUserOperation, getUserOperationHash, toPackedUserOperation } from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress } from "viem/accounts";
import { bindRecoveryKeyMessage, ownershipChallenge, ownershipMessage } from "../lib/wallet/account.ts";
import { verifyAssertion } from "../lib/wallet/api/http.ts";
import { addresses, chain, isDeployed, partnerUrl, publicClient } from "../lib/wallet/env.ts";
import { ApiError, softwareAuthenticator, type Sent } from "../lib/wallet/phone.ts";
import { setSunset } from "../lib/wallet/sunset.ts";
import { attack } from "./attack.ts";
import { APP, mintUsdc, newPhone, sendEth } from "./software-phone.ts";

const ANNA = privateKeyToAddress(generatePrivateKey());
const BOB = privateKeyToAddress(generatePrivateKey());
const CARL = privateKeyToAddress(generatePrivateKey());
const SANCTIONED: Address = "0x098B716B8Aaf21512996dC57EB0615e2383E2f96"; // flagged by the compliance demo screening

process.on("exit", () => setSunset(false));

const shareRequests: string[] = [];
const exitRequests: string[] = [];
const apiRequests: string[] = [];
// The signatures the phone hands Swissquote, by operation hash.
const signatures = new Map<string, Hex>();
let tamper: ((body: any) => any) | undefined;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith("/share")) shareRequests.push(url);
  if (url.startsWith(APP)) apiRequests.push(url);
  const signed = url.match(/\/operations\/(0x[0-9a-f]{64})$/);
  if (signed && init?.method === "POST") signatures.set(signed[1], JSON.parse(String(init.body)).signature);
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
const chainTime = async () => Number((await publicClient.getBlock({ blockTag: "pending" })).timestamp);
async function warp(hours: number) {
  await publicClient.request({ method: "evm_increaseTime", params: [numberToHex(hours * 3600)] } as never);
  await publicClient.request({ method: "evm_mine", params: [] } as never);
}
function held(sent: Sent) {
  assert.ok("releaseAt" in sent, "Swissquote holds it");
  return sent;
}

const post = (url: string, body: unknown) => realFetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

console.log("1. Create, without a Swissquote account: passkey, 2-of-3 Shamir split (A phone, B Swissquote, C partner), recovery key");
let session: string | undefined;
const phone = newPhone({ session: () => session });
await phone.splitKey(await phone.createPasskey());
assert.ok("sealed" in phone.device()!.share, "Share A is sealed under the passkey's PRF output");
const recoveryKey = phone.createRecoveryKey();
const wallet = await phone.register(recoveryKey.address);
assert.equal((await phone.state()).owner, undefined, "no owner record until the client links the wallet");
const attacker = privateKeyToAccount(generatePrivateKey());
const hijack = await post(`${APP}/api/wallets`, {
  signer: phone.device()!.signer,
  recoveryKey: attacker.address,
  signature: await attacker.signMessage({ message: bindRecoveryKeyMessage(phone.device()!.signer, attacker.address) }),
});
assert.equal(hijack.status, 403, "only the wallet key can name its recovery key");
const decoy = newPhone();
await decoy.splitKey(await decoy.createPasskey());
await refused(decoy.register(recoveryKey.address), 409);
await mintUsdc(wallet, "100");

console.log("2. Link it to a Swissquote client (mock): the wallet's passkey signs, with Face ID, that the wallet is theirs");
const link = async (body: { session: string; assertion: unknown }) => (await post(`${APP}/api/wallets/${wallet}/link`, body)).status;
const intruder = await phone.signIn();
const strangerPasskey = softwareAuthenticator(P256.randomPrivateKey(), APP);
const { metadata, signature: forged } = (await strangerPasskey.sign("software", ownershipChallenge(intruder.client.number, wallet))).assertion;
const forgedLink = { metadata, signature: { r: numberToHex(forged.r), s: numberToHex(forged.s) } };
assert.equal(await link({ session: intruder.session, assertion: forgedLink }), 403, "only the wallet's passkey links the wallet to a client");
assert.equal(await link({ session: "unknown", assertion: forgedLink }), 401, "linking needs a Swissquote session");
const sharesBefore = shareRequests.length;
const signedIn = await phone.signIn();
await phone.link(signedIn);
session = signedIn.session;
assert.equal(shareRequests.length, sharesBefore, "linking rebuilds no key: Share B stays with Swissquote");
console.log(`   wallet ${wallet}, owned by Swissquote client ${signedIn.client.number}`);
const { owner } = await phone.state();
assert.ok(owner, "Swissquote tells the signed-in owner the wallet is theirs");
assert.equal(owner.client, signedIn.client.number, "Swissquote recorded the client number against the wallet");
assert.equal(owner.statement, ownershipMessage(signedIn.client.number, wallet));
assert.ok(verifyAssertion(owner.assertion, keccak256(toHex(owner.statement)), phone.device()!.passkey), "the wallet's passkey signed it, with Face ID");
const anyone = (await (await realFetch(`${APP}/api/wallets/${wallet}`)).json()) as Record<string, unknown>;
assert.equal("owner" in anyone, false, "without the owner's session, Swissquote names no owner: bank secrecy");
await refused(phone.link(await phone.signIn()), 409);
await phone.link(await phone.signIn(signedIn.session));
assert.equal((await phone.state()).owner?.createdAt, owner.createdAt, "linking again as the same client changes nothing");

console.log("3. Send 20 USDC: deploys the account, Face ID + the key cached since the split");
await phone.sendUsdc(ANNA, "20");
assert.equal(await usdcOf(ANNA), parseUnits("20", 6));
assert.equal(shareRequests.length, 0, "the key made at the split is still cached");

console.log("4. Cache expired or app reopened: one Face ID unlocks Share B, then the key is cached again");
phone.forgetKey();
await phone.sendUsdc(ANNA, "1");
await phone.sendUsdc(ANNA, "1");
assert.equal(shareRequests.length, 1, "B is fetched once, then the rebuilt key is reused");

console.log("5. Swissquote refuses to sponsor a sanctioned recipient");
await mintUsdc(wallet, "3000");
const sanctioned = (await refused(phone.sendUsdc(SANCTIONED, "1"), 403)) as { decision: { status: string; reasons: string[] } };
assert.equal(sanctioned.decision.status, "DENY_ASSISTANCE");
console.log(`   1 USDC: ${sanctioned.decision.status}, ${sanctioned.decision.reasons.join(" ")}`);

console.log("6. Over 1,000 USDC: one Face ID, then Swissquote holds it for 24 hours, and the EntryPoint refuses it sooner");
const { usdc } = await phone.config();
const big = await phone.prepare({ to: usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [ANNA, parseUnits("2000", 6)] }) });
assert.ok(big.releaseAt && Math.abs(big.releaseAt - (await chainTime()) - 24 * 3600) < 60, "the phone reads a release 24 hours out");
const first = held(await phone.approve(big));
assert.deepEqual(first, { hash: big.hash, releaseAt: big.releaseAt });
assert.deepEqual((await phone.state()).held.map((p) => [p.hash, p.to, p.value]), [[big.hash, ANNA, parseUnits("2000", 6).toString()]]);
/** Anyone who holds the signed held payment submits it through the EntryPoint, simulated at the pending block. */
const submitByAnyone = () =>
  publicClient.simulateContract({
    address: addresses.entryPoint,
    abi: entryPoint07Abi,
    functionName: "handleOps",
    args: [[toPackedUserOperation({ ...formatUserOperation(big.userOp), signature: signatures.get(big.hash)! })], ANNA],
    account: ANNA,
    blockTag: "pending",
  });
await assert.rejects(submitByAnyone(), /AA32 paymaster expired or not due/, "the signed payment can't go on-chain before its release, whoever submits it");
console.log("   the 2,000 USDC held isn't available: of the wallet's 3,078 USDC, a payment of 1,100 is refused");
assert.equal(
  ((await refused(phone.sendUsdc(ANNA, "1100"), 403)) as { error: string }).error,
  "Only 1,078 USDC is available. 2,000 USDC is set aside for payments that haven't left yet.",
);

console.log("7. A small payment meanwhile leaves at once: the held one has a nonce key of its own");
assert.ok("transactionHash" in (await phone.sendUsdc(ANNA, "1")));

console.log("8. The client cancels it with Face ID; Swissquote discards it");
await phone.cancelPayment(first.hash);
assert.deepEqual((await phone.state()).held, []);

console.log("9. Another, cancelled by Swissquote for the client with the Recovery Key, as when a thief has the phone");
const second = held(await phone.sendUsdc(ANNA, "1500"));
await refused(phone.cancelPaymentWithSwissquote(generatePrivateKey(), second.hash), 403);
await phone.cancelPaymentWithSwissquote(recoveryKey.secret, second.hash);
assert.deepEqual((await phone.state()).held, []);

console.log("10. Another is still held after 23 hours, and leaves after 24 once Swissquote screened it again");
const third = held(await phone.sendUsdc(ANNA, "2000"));
const before = await usdcOf(ANNA);
await warp(23);
assert.equal((await phone.state()).held[0]?.hash, third.hash);
assert.equal(await usdcOf(ANNA), before);
await warp(1);
assert.deepEqual((await phone.state()).held, []);
assert.equal(await usdcOf(ANNA), before + parseUnits("2000", 6));
await refused(phone.cancelPayment(third.hash), 404);

console.log("11. No amount is capped: 15,000 USDC more today is held 24 hours like any large payment, and cancelled");
await mintUsdc(wallet, "15000");
const huge = held(await phone.sendUsdc(ANNA, "15000"));
await phone.cancelPayment(huge.hash);
assert.deepEqual((await phone.state()).held, []);

console.log("12. An attacker with the stolen phone and the email inbox is stopped at every step, with Face ID once the phone is reported stolen, then with the Recovery Key and a forged ID");
// MOCKED: the owner reads the number off their ID card; here the one the Swissquote app showed them.
const identity = { document: signedIn.client.document };
await attack({ phone: structuredClone(phone.device()!), homeKey: recoveryKey.secret, unlocked: phone, ownersId: identity });

console.log("13. A wallet never linked: Swissquote can't lock its phone, the attacker is stopped without an ID check, and the Recovery Key alone starts its recovery");
const plain = newPhone();
await plain.splitKey(await plain.createPasskey());
const plainKey = plain.createRecoveryKey();
const plainWallet = await plain.register(plainKey.address);
await mintUsdc(plainWallet, "100");
assert.equal((await refused(plain.reportLost({ document: "C0000000" }), 403)).refused, "unlinked", "no ID to check, so no lock");
await attack({ phone: structuredClone(plain.device()!), homeKey: plainKey.secret, unlocked: plain });
const plainNew = newPhone();
const plainFound = await plainNew.findRecovery(plainKey.secret);
assert.deepEqual(plainFound, { address: plainWallet, pendingRecovery: null, chainTime: plainFound.chainTime, linked: false });
await plainNew.splitKey(await plainNew.createPasskey());
const plainStarted = await plainNew.startRecovery(plainKey.secret);
assert.equal(plainStarted.signedIn, undefined, "no ID check, so no Swissquote client to sign in as");
await refused(plainNew.finalizeRecovery(), 409);

console.log("14. Lose the phone. New phone: ID card number, new passkey and split; the recovery key signs, B and C rebuild the old key on the new phone");
const newOne = newPhone();
const found = await newOne.findRecovery(recoveryKey.secret);
assert.deepEqual(found, { address: wallet, pendingRecovery: null, chainTime: found.chainTime, linked: true }, "the key finds the wallet and learns nothing about its owner");
await newOne.splitKey(await newOne.createPasskey());
assert.equal((await refused(newOne.startRecovery(recoveryKey.secret), 403)).refused, "identity", "a linked wallet's recovery needs the ID");
await refused(newOne.startRecovery(recoveryKey.secret, { document: "C0000000" }), 403);
const started = await newOne.startRecovery(recoveryKey.secret, identity);
assert.equal(started.address, wallet);
assert.equal(started.signedIn?.client.number, signedIn.client.number, "the ID check signs the new phone in as the owner");
const now = Number((await publicClient.getBlock()).timestamp);
assert.ok(started.executeAfter >= now + 48 * 3600 - 5, "the delay is 48 hours");
console.log(`   recovery pending until ${new Date(started.executeAfter * 1000).toISOString()}`);

console.log("15. The old phone cancels it from the app (passkey + key)");
await phone.cancelRecovery();
assert.equal((await phone.state()).pendingRecovery, null);

console.log("16. The client reports the old phone stolen: Swissquote locks its credentials, and stops a payment it held from that phone");
const setLock = (method: "POST" | "DELETE") =>
  realFetch(`${APP}/api/wallets/${wallet}/lock`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ identity }) });
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
const stolen = held(await phone.sendUsdc(ANNA, "1200"));
assert.equal((await setLock("POST")).status, 200, "locked again");
const annaBefore = await usdcOf(ANNA);
await warp(24);
assert.deepEqual(
  (await phone.state()).held.map((p) => [p.hash, p.stopped]),
  [[stolen.hash, "Swissquote locked this phone after it was reported lost."]],
  "the lock stops the held payment when its time comes",
);
assert.equal(await usdcOf(ANNA), annaBefore);
await phone.cancelPayment(stolen.hash);
assert.deepEqual((await phone.state()).held, [], "the locked phone can still call it off");

console.log("17. Started again: the locked phone can't cancel it, Swissquote still cancels it as guardian");
await newOne.startRecovery(recoveryKey.secret, identity);
await refused(phone.cancelRecovery(), 423);
await newOne.cancelRecoveryWithSwissquote(recoveryKey.secret);
assert.equal((await newOne.state()).pendingRecovery, null);

console.log("18. Started again: finalizing before 48 hours fails, after it succeeds");
await newOne.startRecovery(recoveryKey.secret, identity);
await refused(newOne.finalizeRecovery(), 409);
await warp(48);
await assert.rejects(submitByAnyone(), /AA32 paymaster expired or not due/, "the payment cancelled at step 8 is dead for good: its sponsorship ended 48 hours after its release");
await newOne.finalizeRecovery();
const state = await newOne.state();
assert.equal(state.signer, newOne.device()!.signer);
assert.equal(state.address, wallet);

console.log("19. The new phone sends 5 USDC with no unlock; the old credentials stay dead");
await newOne.sendUsdc(ANNA, "5");
await refused(phone.sendUsdc(ANNA, "1"), 422);
phone.forgetKey();
await refused(phone.sendUsdc(ANNA, "1"), 403);
assert.equal((await phone.state()).locked, false, "the lock on the old credentials no longer applies");
assert.equal((await newOne.state()).locked, false);
console.log(`   Anna has ${formatUnits(await usdcOf(ANNA), 6)} USDC, the wallet ${formatUnits(await usdcOf(wallet), 6)} USDC`);
assert.equal(await usdcOf(ANNA), parseUnits("2029", 6));

console.log("20. The never-linked wallet's recovery, started at step 13, finishes too, and its new phone sends 5 USDC");
await plainNew.finalizeRecovery();
assert.equal((await plainNew.state()).signer, plainNew.device()!.signer);
await plainNew.sendUsdc(CARL, "5");
assert.equal(await usdcOf(CARL), parseUnits("5", 6));

console.log("21. Swissquote's free gas can't be farmed: it refuses a payment of 0, and a wallet's 21st operation within an hour of chain time");
const farmer = newPhone();
await farmer.splitKey(await farmer.createPasskey());
const farm = await farmer.register(farmer.createRecoveryKey().address);
await mintUsdc(farm, "1");
const zero = (await refused(farmer.sendUsdc(BOB, "0"), 403)) as { error: string };
assert.equal(zero.error, "Swissquote doesn't pay for a payment of 0 USDC.");
for (let i = 0; i < 20; i++) await farmer.sendUsdc(BOB, "0.01");
const farmed = (await refused(farmer.sendUsdc(BOB, "0.01"), 429)) as { error: string };
assert.match(farmed.error, /^Swissquote pays the network fee for up to 20 payments an hour\. Try again in \d+ minutes?\.$/);
console.log(`   ${zero.error} After 20 payments: ${farmed.error}`);
await warp(1);
await farmer.sendUsdc(BOB, "0.01");
assert.equal(await usdcOf(BOB), parseUnits("0.21", 6), "the hour passed, so Swissquote pays again");

console.log("22. Swissquote's services are closed for good. The client leaves with the money: Face ID, Share A and Share C, gas from the wallet's own ETH");
assert.match(await exitRefusal({}), /running/, "no exit while Swissquote's services run");
const fresh = newPhone();
await fresh.splitKey(await fresh.createPasskey());
const freshWallet = await fresh.register(fresh.createRecoveryKey().address);
const freshClient = await fresh.signIn();
await fresh.link(freshClient);
await mintUsdc(freshWallet, "10");
console.log("   first, on this wallet: five wrong ID numbers, and Swissquote stops checking IDs for it for an hour, the right one included");
const guess = async (document: string) =>
  (await realFetch(`${APP}/api/wallets/${freshWallet}/lock`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identity: { document } }) })).status;
for (let i = 0; i < 5; i++) assert.equal(await guess(`C000000${i}`), 403);
assert.equal(await guess("C0000005"), 429, "the sixth guess isn't checked");
assert.equal(await guess(freshClient.client.document), 429, "nor is the right number, for an hour");
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
assert.equal(await usdcOf(ANNA), parseUnits("18100", 6), "everything the wallet was ever given reached Anna");
assert.equal(exitRequests.length, exitsBefore + 1, "one Face ID, one request for Share C");
assert.equal(await isDeployed(freshWallet), false, "a wallet that never paid has no account on-chain yet");
await sendEth(freshWallet, "0.01");
fresh.forgetKey();
await fresh.exitUsdc(ANNA, "10");
assert.ok(await isDeployed(freshWallet), "the exit deploys the account on the way out");
assert.equal(await usdcOf(ANNA), parseUnits("18110", 6));
assert.equal(exitRequests.length, exitsBefore + 2, "the partner checked the deploying operation's config before releasing C");
assert.deepEqual(apiRequests.slice(apiBefore), [], "neither exit called Swissquote's API");
setSunset(false);
assert.equal((await realFetch(`${APP}/api/config`)).status, 200, "Swissquote's API is back");
assert.match(await exitRefusal({}), /running/, "one successful probe closes the exit at once");
console.log(`   Anna has ${formatUnits(await usdcOf(ANNA), 6)} USDC, both wallets 0; the exit closed again once Swissquote answered`);
console.log("All good.");
