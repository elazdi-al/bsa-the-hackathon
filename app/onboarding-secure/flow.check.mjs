// Walks the onboarding state machine end to end: `node app/onboarding-secure/flow.check.mjs`
import assert from "node:assert/strict";
import { flowReducer, initialFlow, keyState, pendingTimer } from "./flow.ts";

const run = (step, ...actions) => actions.reduce(flowReducer, step);
const fire = (step, ms) => {
  const timer = pendingTimer(step);
  assert.equal(timer?.ms, ms, `${step.name}/${step.status} waits ${ms}ms`);
  return flowReducer(step, timer.action);
};

let s = run(initialFlow, { type: "verify" }, { type: "codeSent" }, { type: "created" }, { type: "walletReady" });
assert.equal(s, initialFlow, "out-of-order actions are ignored");
assert.equal(pendingTimer(s), null);

s = run(s, { type: "create" });
assert.equal(pendingTimer(s), null, "the passkey is real, not a timer");
assert.deepEqual(run(s, { type: "failed" }), initialFlow, "a cancelled Face ID returns to the button");

s = run(s, { type: "created" });
assert.deepEqual(s, { name: "twofa", status: "idle" });
assert.equal(keyState(s, "device"), "done");

s = run(s, { type: "create" }, { type: "created" });
assert.deepEqual(s, { name: "recovery", status: "email", email: "" });

s = fire(run(s, { type: "sendCode", email: "vova@sqds.io" }), 1200);
assert.deepEqual(s, { name: "recovery", status: "code", email: "vova@sqds.io" });

s = fire(run(s, { type: "verify" }), 1000);
assert.deepEqual(s, { name: "setup", status: "working" });
assert.equal(keyState(s, "recovery"), "done");
assert.equal(pendingTimer(s), null, "registration is real, not a timer");

s = run(s, { type: "failed" }, { type: "walletReady" });
assert.deepEqual(s, { name: "setup", status: "ready" });
assert.equal(run(s, { type: "walletReady" }, { type: "create" }), s);
console.log("flow ok");
