import type { KeyId, Tone } from "./data";

export type Step =
  | { name: "device" | "twofa"; status: "idle" | "creating" }
  | { name: "recovery"; status: "email" | "sending" | "code" | "verifying"; email: string }
  | { name: "setup"; status: "working" | "ready" };

export type FlowAction =
  | { type: "create" }
  | { type: "created" }
  | { type: "sendCode"; email: string }
  | { type: "codeSent" }
  | { type: "verify" }
  | { type: "verified" }
  | { type: "walletReady" };

export const initialFlow: Step = { name: "device", status: "idle" };

export function flowReducer(step: Step, action: FlowAction): Step {
  switch (action.type) {
    case "create":
      if ((step.name === "device" || step.name === "twofa") && step.status === "idle")
        return { name: step.name, status: "creating" };
      return step;
    case "created":
      if (step.name === "device" && step.status === "creating") return { name: "twofa", status: "idle" };
      if (step.name === "twofa" && step.status === "creating") return { name: "recovery", status: "email", email: "" };
      return step;
    case "sendCode":
      if (step.name === "recovery" && step.status === "email") return { ...step, status: "sending", email: action.email };
      return step;
    case "codeSent":
      if (step.name === "recovery" && step.status === "sending") return { ...step, status: "code" };
      return step;
    case "verify":
      if (step.name === "recovery" && step.status === "code") return { ...step, status: "verifying" };
      return step;
    case "verified":
      if (step.name === "recovery" && step.status === "verifying") return { name: "setup", status: "working" };
      return step;
    case "walletReady":
      if (step.name === "setup" && step.status === "working") return { name: "setup", status: "ready" };
      return step;
  }
}

/** The mock latency of whatever the flow is currently waiting on. */
export function pendingTimer(step: Step): { ms: number; action: FlowAction } | null {
  if ((step.name === "device" || step.name === "twofa") && step.status === "creating")
    return { ms: step.name === "device" ? 1300 : 1500, action: { type: "created" } };
  if (step.name === "recovery" && step.status === "sending") return { ms: 1200, action: { type: "codeSent" } };
  if (step.name === "recovery" && step.status === "verifying") return { ms: 1000, action: { type: "verified" } };
  if (step.name === "setup" && step.status === "working") return { ms: 2400, action: { type: "walletReady" } };
  return null;
}

const ORDER: readonly KeyId[] = ["device", "twofa", "recovery"];

export function keyState(step: Step, id: KeyId): "done" | "active" | "pending" {
  if (step.name === "setup") return "done";
  const diff = ORDER.indexOf(id) - ORDER.indexOf(step.name);
  return diff < 0 ? "done" : diff === 0 ? "active" : "pending";
}

export function toneOf(step: Step): Tone {
  return step.name === "device"
    ? "blue"
    : step.name === "twofa"
      ? "orange"
      : step.name === "recovery"
        ? "violet"
        : "white";
}
