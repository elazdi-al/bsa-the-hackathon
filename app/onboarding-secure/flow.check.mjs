// Walks the onboarding state machine end to end: `node app/onboarding-secure/flow.check.mjs`
import assert from "node:assert/strict";
import { flowReducer, initialFlow, keyState, pendingTimer } from "./flow.ts";

const run = (state, ...actions) => actions.reduce(flowReducer, state);
const settle = (state) => {
  for (let timer = pendingTimer(state); timer; timer = pendingTimer(state)) state = flowReducer(state, timer.action);
  return state;
};

let s = run(initialFlow, { type: "verify" }, { type: "codeSent" });
assert.equal(s, initialFlow, "out-of-order actions are ignored");

s = run(initialFlow, { type: "create" });
assert.deepEqual(s, { step: { name: "device", status: "creating" }, faceId: "scanning" });
s = settle(s);
assert.deepEqual(s, { step: { name: "twofa", status: "idle" }, faceId: "hidden" });
assert.equal(keyState(s.step, "device"), "done");

s = settle(run(s, { type: "create" }));
assert.deepEqual(s.step, { name: "recovery", status: "email", email: "" });

s = settle(run(s, { type: "sendCode", email: "vova@sqds.io" }));
assert.deepEqual(s.step, { name: "recovery", status: "code", email: "vova@sqds.io" });

s = settle(run(s, { type: "verify" }));
assert.deepEqual(s, { step: { name: "setup", status: "ready" }, faceId: "hidden" });
assert.equal(pendingTimer(s), null);
console.log("flow ok");
