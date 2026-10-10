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

s = fire(run(s, { type: "create" }), 1300);
assert.deepEqual(s, { name: "twofa", status: "idle" });
assert.equal(keyState(s, "device"), "done");

s = fire(run(s, { type: "create" }), 1500);
assert.deepEqual(s, { name: "recovery", status: "email", email: "" });

s = fire(run(s, { type: "sendCode", email: "vova@sqds.io" }), 1200);
assert.deepEqual(s, { name: "recovery", status: "code", email: "vova@sqds.io" });

s = fire(run(s, { type: "verify" }), 1000);
assert.deepEqual(s, { name: "setup", status: "working" });
assert.equal(keyState(s, "recovery"), "done");

s = fire(s, 2400);
assert.deepEqual(s, { name: "setup", status: "ready" });
assert.equal(pendingTimer(s), null, "ready has no timer");
assert.equal(run(s, { type: "walletReady" }, { type: "create" }), s);
console.log("flow ok");
