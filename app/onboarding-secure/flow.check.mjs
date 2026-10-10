// Walks the onboarding state machine end to end: `node app/onboarding-secure/flow.check.mjs`
import assert from "node:assert/strict";
import { flowReducer, initialFlow, keyState, pendingTimer, toneOf } from "./flow.ts";

const run = (step, ...actions) => actions.reduce(flowReducer, step);
const fire = (step) => {
  const timer = pendingTimer(step);
  assert.ok(timer && timer.ms > 0, `${step.name}/${step.status} holds on a timer`);
  return flowReducer(step, timer.action);
};

const credential = { id: "AbC-123_xyz", passkey: { x: `0x${"01".repeat(32)}`, y: `0x${"02".repeat(32)}` } };
const signer = `0x${"ab".repeat(20)}`;
const recoveryKey = `0x${"cd".repeat(20)}`;
const address = `0x${"ef".repeat(20)}`;

let s = run(
  initialFlow,
  { type: "keySplit", signer },
  { type: "recoverySaved", recoveryKey },
  { type: "registered", address },
  { type: "passkeyCreated", credential },
  { type: "failed", error: "x" },
  { type: "cancelled" },
  { type: "advance" },
);
assert.equal(s, initialFlow, "out-of-order actions are ignored");
assert.deepEqual(s, { name: "passkey", status: "idle" });
assert.equal(pendingTimer(s), null);
assert.equal(toneOf(s), "blue");

s = run(s, { type: "start" });
assert.equal(pendingTimer(s), null, "the passkey waits on the WebAuthn ceremony, not a timer");
s = run(s, { type: "failed", error: "Your passkey wasn't created. Try again." });
assert.deepEqual(s, { name: "passkey", status: "idle", error: "Your passkey wasn't created. Try again." });
s = run(s, { type: "start" });
assert.deepEqual(s, { name: "passkey", status: "working" }, "start clears the error");
assert.equal(run(s, { type: "start" }), s, "a working step can't start twice");
s = run(s, { type: "passkeyCreated", credential });
assert.deepEqual(s, { name: "key", status: "idle", keys: { credential } });
assert.deepEqual(["passkey", "key", "recovery"].map((id) => keyState(s, id)), ["done", "active", "pending"]);
assert.equal(toneOf(s), "orange");

s = run(s, { type: "start" }, { type: "failed", error: "The key wasn't split." });
assert.deepEqual(s, { name: "key", status: "idle", error: "The key wasn't split.", keys: { credential } }, "a failure keeps the credential");
s = run(s, { type: "start" });
assert.equal(pendingTimer(s), null, "the split waits on the key generation, not a timer");
s = run(s, { type: "keySplit", signer });
assert.deepEqual(s, { name: "key", status: "split", keys: { credential, signer } });
assert.equal(keyState(s, "key"), "active", "the card stays open while the three shares land");
assert.equal(run(s, { type: "start" }, { type: "failed", error: "x" }), s, "a split key can't be split again or fail");

s = fire(s);
assert.deepEqual(s, { name: "recovery", status: "idle", keys: { credential, signer } });
assert.equal(toneOf(s), "violet");

s = run(s, { type: "start" }, { type: "cancelled" });
assert.deepEqual(s, { name: "recovery", status: "idle", keys: { credential, signer } }, "closing the share sheet is not an error");
s = run(s, { type: "start" }, { type: "failed", error: "Your Recovery Key wasn't saved. Try again." });
assert.equal(s.error, "Your Recovery Key wasn't saved. Try again.");
s = run(s, { type: "start" });
assert.equal(pendingTimer(s), null, "the recovery key waits on the save");
s = run(s, { type: "recoverySaved", recoveryKey });
assert.deepEqual(s, { name: "setup", status: "working", keys: { credential, signer, recoveryKey } });
assert.deepEqual(["passkey", "key", "recovery"].map((id) => keyState(s, id)), ["done", "done", "done"]);
assert.equal(toneOf(s), "white");
assert.equal(pendingTimer(s), null, "setup waits on the registration");

s = run(s, { type: "cancelled" });
assert.equal(s.status, "working", "only the share sheet cancels");
s = run(s, { type: "failed", error: "Your wallet wasn't set up. Try again." });
assert.deepEqual(
  s,
  { name: "setup", status: "idle", error: "Your wallet wasn't set up. Try again.", keys: { credential, signer, recoveryKey } },
  "a failed registration keeps all three keys for the retry",
);
s = run(s, { type: "start" });
assert.deepEqual(s, { name: "setup", status: "working", keys: { credential, signer, recoveryKey } });
s = run(s, { type: "registered", address });
assert.deepEqual(s, { name: "setup", status: "registered", address }, "the wallet is registered; the setup row holds its beat");
assert.equal(run(s, { type: "start" }, { type: "failed", error: "x" }), s, "a registered wallet can't fail");
s = fire(s);
assert.deepEqual(s, { name: "setup", status: "ready", address });
assert.equal(pendingTimer(s), null, "ready has no timer");
assert.equal(run(s, { type: "start" }, { type: "failed", error: "x" }, { type: "registered", address: "0x00" }), s);
console.log("flow ok");
