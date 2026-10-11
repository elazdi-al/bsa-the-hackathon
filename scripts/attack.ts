// An attacker holds the owner's phone and their email inbox, and tries to take the wallet, linked to a Swissquote
// client or not, as each runs the same: A1 pays or links the wallet without Face ID, A2 resets by email, A3 recovers
// with a Recovery Key of their own, A4, without the Recovery Key, is refused by Swissquote and the independent service,
// and A5, with it, is stopped by the 48-hour hold and the owner's cancel. On a linked wallet A6 passes Face ID and is
// stopped once the owner, with the Recovery Key, has Swissquote lock the phone, which the thief's own key can't undo.
// On an unlinked wallet A6 is not run, as Swissquote can't lock that phone. Each attempt prints who stopped it and
// why, and asserts it. Every recovery that starts ends cancelled, and a locked phone unlocked, so the account keeps
// working. Run by npm run attack <account> and npm run e2e, against npm run local only.
import assert from "node:assert/strict";
import { P256 } from "ox";
import {
  BaseError,
  ContractFunctionRevertedError,
  encodeFunctionData,
  erc20Abi,
  numberToHex,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { entryPoint07Abi, formatUserOperation, getUserOperationHash, toPackedUserOperation, type UserOperation } from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  accountAbi,
  bindRecoveryKeyMessage,
  encodeNormalSignature,
  encodeRecoverySignature,
  factoryAbi,
  type Passkey,
} from "../lib/wallet/account.ts";
import { addresses, chain, partnerUrl, publicClient } from "../lib/wallet/env.ts";
import { ApiError, softwareAuthenticator, unseal, type Device, type Phone, type WalletState } from "../lib/wallet/phone.ts";
import { split } from "../lib/wallet/shamir.ts";
import { signTicket } from "../lib/wallet/tickets.ts";
import { APP, newPhone } from "./software-phone.ts";

const say = (who: string, what: string) => console.log(`   ${who.padEnd(20)}${what}`);

async function send(url: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Asserts Swissquote or the independent service refused with `status`, and returns its reason. */
async function refused(reply: Promise<{ status: number; body: Record<string, unknown> }>, status: number) {
  const { status: got, body } = await reply;
  assert.equal(got, status, `expected a ${status} refusal, got ${got}: ${JSON.stringify(body)}`);
  return [body.error, body.detail].filter(Boolean).join(" ");
}

/** Asserts a phone call failed, and returns why. */
async function failed(promise: Promise<unknown>, status?: number) {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  assert.ok(error instanceof Error, "expected a refusal");
  if (status) assert.ok(error instanceof ApiError && error.status === status, `expected ${status}, got ${error.message}`);
  return [error.message, error instanceof ApiError && error.body.detail].filter(Boolean).join(" ");
}

/** The account's own verdict on a signed operation, simulated through the EntryPoint: it must reject the signature. */
async function accountVerdict(userOp: UserOperation<"0.7">, signature: Hex) {
  const error = await publicClient
    .simulateContract({
      account: addresses.swissquote,
      address: addresses.entryPoint,
      abi: entryPoint07Abi,
      functionName: "handleOps",
      args: [[toPackedUserOperation({ ...userOp, signature })], addresses.swissquote],
    })
    .then(() => undefined, (e: unknown) => e);
  const reverted = error instanceof BaseError ? error.walk((e) => e instanceof ContractFunctionRevertedError) : undefined;
  const reason = reverted instanceof ContractFunctionRevertedError ? String(reverted.data?.args?.[1]) : String(error);
  assert.match(reason, /^AA24 signature error/, "the account rejects the signature");
  return reason;
}

const hashOf = (userOp: UserOperation<"0.7">) =>
  getUserOperationHash({ chainId: chain.id, entryPointAddress: addresses.entryPoint, entryPointVersion: "0.7", userOperation: userOp });

/**
 * `phone`: a copy of what the owner's phone stores, as the attacker reads it. `homeKey`: the owner's Recovery Key,
 * which the attacker copies in A5, and with which the owner cancels and has Swissquote lock the phone. `unlocked`:
 * the owner's phone itself, as a thief holds it once Face ID passes (A6). `linked`: the wallet is linked to a
 * Swissquote client, so Swissquote can lock its phone.
 */
export async function attack({ phone: stolen, homeKey, unlocked, linked }: { phone: Device; homeKey: Hex; unlocked: Phone; linked: boolean }) {
  const wallet = stolen.address!;
  const live = (await send(`${APP}/api/wallets/${wallet}`)).body as unknown as WalletState;
  assert.equal(live.pendingRecovery, null, "the wallet has no recovery pending");
  assert.equal("owner" in live, false, "Swissquote names the owner only to the owner's own session");
  const thief = privateKeyToAccount(generatePrivateKey());
  const thiefPasskey = P256.randomPrivateKey();
  console.log(`   Owner's wallet ${wallet}; the attacker has the phone and the email inbox. Swissquote's public record of it names no owner.`);

  console.log("A1. Pay from the stolen phone, or link its wallet to Swissquote, without the owner's Face ID");
  const phone = newPhone({ passkey: thiefPasskey, storage: { getItem: () => JSON.stringify(stolen), setItem() {}, removeItem() {} } });
  const transfer = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [thief.address, parseUnits("50", 6)] });
  const prepared = await phone.prepare({ to: addresses.usdc, data: transfer });
  say("Phone", `Share A stays sealed without the owner's face: ${await failed(unseal(stolen.share, undefined, stolen.signer))}`);
  const { assertion, secret } = await softwareAuthenticator(thiefPasskey, APP).sign(stolen.credentialId, prepared.hash);
  const wrongKey = await unseal(stolen.share, secret, stolen.signer).then(() => assert.fail("Share A opened"), (e: Error) => e.name);
  say("Phone", `The attacker's own passkey doesn't open it either: AES-GCM refuses its key (${wrongKey})`);
  const wire = { metadata: assertion.metadata, signature: { r: numberToHex(assertion.signature.r), s: numberToHex(assertion.signature.s) } };
  say("Swissquote", `refused Share B: ${await refused(send(`${APP}/api/wallets/${wallet}/share`, { hash: prepared.hash, assertion: wire }), 403)}`);
  const userOp = formatUserOperation(prepared.userOp) as UserOperation<"0.7">;
  const forged = encodeNormalSignature(await thief.sign({ hash: prepared.hash }), assertion);
  say("Account", `rejects the payment (simulated): ${await accountVerdict(userOp, forged)}, neither its wallet key nor its passkey signed`);
  const asClient = await failed(phone.link(await phone.signIn()), 403);
  say("Swissquote", `refused to link the wallet to the attacker's made-up client${linked ? ", which would sign them in as the owner" : ""}: ${asClient}`);

  console.log("A2. \"Forgot my keys\" with only the email inbox");
  const issues = await send(`${APP}/api/recovery`, { email: "owner@example.ch", reset: true });
  assert.equal(issues.status, 400);
  const missing = (issues.body.issues as { path: string[] }[]).map((issue) => issue.path.join(".")).join(", ");
  say("Swissquote", `refused: there is no email reset. A recovery asks for ${missing}, and only the Recovery Key signs it`);

  console.log("A3. Recover with a Recovery Key the attacker made");
  const theirSecret = generatePrivateKey();
  const theirKey = privateKeyToAccount(theirSecret);
  const { passkey: theirPasskey } = await softwareAuthenticator(thiefPasskey, APP).create("attacker");
  const newKey = await splitKeptWhole(theirPasskey);
  say("Swissquote", `refused to find a wallet: ${await failed(newPhone().findRecovery(theirSecret), 404)}`);
  const rebind = { recoveryKey: theirKey.address, signature: await theirKey.signMessage({ message: bindRecoveryKeyMessage(stolen.signer, theirKey.address) }) };
  say("Swissquote", `refused to bind it to the wallet key: ${await refused(send(`${APP}/api/wallets`, { signer: stolen.signer, ...rebind }), 403)}`);
  say("Independent service", `refused to bind it: ${await refused(send(`${partnerUrl}/shares/${stolen.signer}/recovery-key`, rebind), 400)}`);
  const recoveryOp = await unsponsoredRecovery(wallet, live, newKey.address, theirPasskey);
  const hash = hashOf(recoveryOp);
  const recoverySignature = encodeRecoverySignature(await thief.sign({ hash }), await theirKey.sign({ hash }));
  say("Account", `rejects the recovery (simulated): ${await accountVerdict(recoveryOp, recoverySignature)}, its Recovery Key is ${live.recoveryKey}`);

  // The attacker's new key names the owner's Recovery Key by its public address, which anyone may read.
  const asOwner = {
    recoveryKey: live.recoveryKey,
    signer: newKey.address,
    signature: await newKey.signMessage({ message: bindRecoveryKeyMessage(newKey.address, live.recoveryKey) }),
  };

  console.log("A4. Recover without the Recovery Key, naming the owner's by its public address");
  assert.equal((await send(`${partnerUrl}/shares/${newKey.address}/recovery-key`, asOwner)).status, 200, "the partner binds the attacker's own key");
  const unsigned = await send(`${APP}/api/recovery`, asOwner);
  assert.equal(unsigned.status, 200, "Swissquote prepares the recovery");
  const { hash: unsignedHash, userOp: unsignedOp } = unsigned.body as { hash: Hex; userOp: unknown };
  say("Swissquote", "prepared the recovery: the Recovery Key's signature is what it asks for next");
  const signature = await thief.sign({ hash: unsignedHash });
  say("Swissquote", `refused Share B: ${await refused(send(`${APP}/api/wallets/${wallet}/recovery`, { hash: unsignedHash, signature }), 403)}`);
  const approval = await signTicket(thief, chain.id, "RecoveryApproval", { wallet, userOpHash: unsignedHash });
  say("Independent service", `refused Share C, without Swissquote's approval: ${await refused(send(`${partnerUrl}/recovery`, { approval, userOp: unsignedOp, signature }), 400)}`);

  console.log("A5. The real Recovery Key, copied from the owner's home");
  const withKey = newPhone();
  const found = await withKey.findRecovery(homeKey);
  assert.equal(found.linked, linked);
  assert.deepEqual(Object.keys(found).sort(), ["address", "chainTime", "linked", "pendingRecovery"], "the key learns nothing about the owner");
  say("Swissquote", "found the key's wallet, but told its holder nothing about the owner, not even a client number");
  await withKey.splitKey(await withKey.createPasskey());
  const started = await withKey.startRecovery(homeKey);
  say("Swissquote", "authorized the recovery: the Recovery Key signed it, which is what it checks on any wallet");
  await heldThenCancelled(withKey, started.executeAfter, homeKey, wallet);

  if (!linked) {
    console.log(
      "A6. A thief who can unlock the phone, so Face ID passes: not run. Swissquote locks only a linked wallet's phone; a thief who unlocks this one pays like the owner, at once",
    );
    return;
  }

  console.log("A6. The thief can unlock the phone, so Face ID passes. The owner reports it stolen with the Recovery Key");
  const payment = await unlocked.prepare({ to: addresses.usdc, data: transfer });
  say("Phone", "Face ID passes, so it pays like the owner, at once, until they report it. Here it only prepares 50 USDC to the attacker");
  say("Swissquote", `refused to lock the phone for the attacker's own key: ${await failed(newPhone().lockPhone(theirSecret, true, wallet), 403)}`);
  const owner = newPhone();
  await owner.lockPhone(homeKey, true, wallet);
  say("Swissquote", "locked the phone: the owner's Recovery Key signed the report");
  say("Swissquote", `refused to unlock it for the attacker's own key: ${await failed(newPhone().lockPhone(theirSecret, false, wallet), 403)}`);
  say("Swissquote", `refused to prepare or sponsor a payment: ${await failed(unlocked.sendUsdc(thief.address, "50"), 423)}`);
  unlocked.forgetKey();
  say("Swissquote", `refused Share B for the payment prepared before the report (key cache empty): ${await failed(unlocked.approve(payment), 423)}`);
  say("Swissquote", `refused to link it again, which would sign the thief in as the owner: ${await failed(unlocked.link(await unlocked.signIn()), 423)}`);
  await owner.splitKey(await owner.createPasskey());
  await owner.startRecovery(homeKey);
  say("Owner", "started a recovery on a new phone, with the Recovery Key");
  say("Swissquote", `refused the stolen phone's cancel: ${await failed(unlocked.cancelRecovery(), 423)}`);
  say(
    "Account",
    "is unchanged on chain: the lock is Swissquote's. A key the phone still caches (up to 3 hours) could pay through a public bundler, if the wallet holds ETH for gas",
  );
  await owner.cancelRecoveryWithSwissquote(homeKey);
  await owner.lockPhone(homeKey, false, wallet);
  const after = await unlocked.state();
  assert.equal(after.pendingRecovery, null, "no recovery is left pending");
  assert.equal(after.locked, false, "the phone is unlocked");
  say("Demo reset", "the owner cancelled that recovery through Swissquote and had it unlock the phone, both with the Recovery Key");
}

/** The account holds a recovery for 48 hours, then the owner cancels it through Swissquote with the Recovery Key. */
async function heldThenCancelled(withKey: Phone, executeAfter: number, homeKey: Hex, wallet: Address) {
  const { timestamp } = await publicClient.getBlock({ blockTag: "pending" });
  const hours = (executeAfter - Number(timestamp)) / 3600;
  assert.ok(hours > 47.9, "the account holds the recovery for 48 hours");
  say("Account", `holds the recovery for ${Math.round(hours)} hours; the owner's phone and Swissquote see it at once`);
  say("Account", `refused to finish early: ${await failed(withKey.finalizeRecovery(), 409)}`);
  const cancelled = await newPhone().cancelRecoveryWithSwissquote(homeKey, wallet);
  say("Owner", `cancelled it through Swissquote with their Recovery Key (${cancelled.slice(0, 10)}...)`);
  assert.equal((await withKey.state()).pendingRecovery, null, "the recovery is gone");
  say("Account", `refused to finish it: ${await failed(withKey.finalizeRecovery(), 409)}`);
}

/** A new wallet key the attacker splits with Swissquote and the independent service, as a new phone does, but keeps whole. */
async function splitKeptWhole(passkey: Passkey) {
  const { key, shares, commitments } = split();
  const { body } = await send(`${APP}/api/shares`, { commitments, passkey, share: shares.swissquote });
  assert.equal((await send(`${partnerUrl}/shares`, { ticket: body.ticket, share: shares.partner })).status, 200, "the partner stores Share C");
  return privateKeyToAccount(key);
}

/** An unsponsored recovery of `wallet` to the attacker's key: Swissquote won't prepare one, so the attacker builds it. */
async function unsponsoredRecovery(wallet: Address, live: WalletState, signer: Address, passkey: Passkey): Promise<UserOperation<"0.7">> {
  const [code, nonce] = await Promise.all([
    publicClient.getCode({ address: wallet }),
    publicClient.readContract({ address: addresses.entryPoint, abi: entryPoint07Abi, functionName: "getNonce", args: [wallet, 0n] }),
  ]);
  const config = { signer: live.signer, passkey: live.passkey, recoveryKey: live.recoveryKey, guardian: addresses.swissquote };
  return {
    sender: wallet,
    nonce,
    callData: encodeFunctionData({ abi: accountAbi, functionName: "initiateRecovery", args: [signer, passkey] }),
    ...(code ? {} : { factory: addresses.factory, factoryData: encodeFunctionData({ abi: factoryAbi, functionName: "createAccount", args: [config, 0n] }) }),
    callGasLimit: 300_000n,
    verificationGasLimit: 1_000_000n,
    preVerificationGas: 50_000n,
    // No fee, so the EntryPoint asks the account for nothing and its signature check is what decides.
    maxFeePerGas: 0n,
    maxPriorityFeePerGas: 0n,
    signature: "0x",
  };
}
