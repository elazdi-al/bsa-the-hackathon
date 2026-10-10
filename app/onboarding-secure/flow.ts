import type { KeyId, Tone } from "./data";

export type Step =
  | { name: "device" | "twofa"; status: "idle" | "creating" }
  | { name: "recovery"; status: "email" | "sending" | "code" | "verifying"; email: string }
  | { name: "setup"; status: "working" | "ready" };

export type FaceId = "hidden" | "scanning" | "success";

export type FlowState = { step: Step; faceId: FaceId };

export type FlowAction =
  | { type: "create" }
  | { type: "created" }
  | { type: "sendCode"; email: string }
  | { type: "codeSent" }
  | { type: "verify" }
  | { type: "verified" }
  | { type: "scanFace" }
  | { type: "faceRecognised" }
  | { type: "dismissFaceId" };

export const initialFlow: FlowState = { step: { name: "device", status: "idle" }, faceId: "hidden" };

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  const { step } = state;
  switch (action.type) {
    case "create":
      if (step.name === "device" && step.status === "idle")
        return { step: { name: "device", status: "creating" }, faceId: "scanning" };
      if (step.name === "twofa" && step.status === "idle")
        return { ...state, step: { name: "twofa", status: "creating" } };
      return state;
    case "created":
      if (step.name === "device" && step.status === "creating")
        return { step: { name: "twofa", status: "idle" }, faceId: "success" };
      if (step.name === "twofa" && step.status === "creating")
        return { ...state, step: { name: "recovery", status: "email", email: "" } };
      return state;
    case "sendCode":
      if (step.name === "recovery" && step.status === "email")
        return { ...state, step: { ...step, status: "sending", email: action.email } };
      return state;
    case "codeSent":
      if (step.name === "recovery" && step.status === "sending") return { ...state, step: { ...step, status: "code" } };
      return state;
    case "verify":
      if (step.name === "recovery" && step.status === "code")
        return { ...state, step: { ...step, status: "verifying" } };
      return state;
    case "verified":
      if (step.name === "recovery" && step.status === "verifying")
        return { ...state, step: { name: "setup", status: "working" } };
      return state;
    case "scanFace":
      return step.name === "setup" && state.faceId === "hidden" ? { ...state, faceId: "scanning" } : state;
    case "faceRecognised":
      return state.faceId === "scanning" ? { ...state, faceId: "success" } : state;
    case "dismissFaceId":
      if (state.faceId !== "success") return state;
      // In setup, the confirmed scan is what makes the wallet ready.
      return step.name === "setup"
        ? { step: { name: "setup", status: "ready" }, faceId: "hidden" }
        : { ...state, faceId: "hidden" };
  }
}

/** The mock latency of whatever the flow is currently waiting on. */
export function pendingTimer({ step, faceId }: FlowState): { ms: number; action: FlowAction } | null {
  if (faceId === "success") return { ms: 900, action: { type: "dismissFaceId" } };
  if ((step.name === "device" || step.name === "twofa") && step.status === "creating")
    return { ms: step.name === "device" ? 1300 : 1500, action: { type: "created" } };
  if (step.name === "recovery" && step.status === "sending") return { ms: 1200, action: { type: "codeSent" } };
  if (step.name === "recovery" && step.status === "verifying") return { ms: 1000, action: { type: "verified" } };
  if (step.name === "setup" && step.status === "working")
    return faceId === "hidden"
      ? { ms: 1100, action: { type: "scanFace" } }
      : { ms: 1300, action: { type: "faceRecognised" } };
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
