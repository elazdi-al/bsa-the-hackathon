import type { registerWallet } from "@/lib/auth-client";
import type { KeyId, Tone } from "./data";

/** The three public credentials W registers at setup. */
export type Keys = Parameters<typeof registerWallet>[0];
type Hex = Keys["mpcKey"];

type Pending = { status: "idle"; error?: string } | { status: "working" };

/** Each step carries what the steps before it made, so setup starts with all three keys in hand. */
export type Step =
  | ({ name: "passkey" } & Pending)
  | ({ name: "key"; keys: Pick<Keys, "credentialId"> } & Pending)
  | { name: "key"; status: "split"; keys: Pick<Keys, "credentialId" | "mpcKey"> }
  | ({ name: "recovery"; keys: Pick<Keys, "credentialId" | "mpcKey"> } & Pending)
  | ({ name: "setup"; keys: Keys } & ({ status: "idle"; error: string } | { status: "working" }))
  | { name: "setup"; status: "registered" | "ready"; address: Hex };

export type FlowAction =
  | { type: "start" }
  | { type: "passkeyCreated"; credentialId: string }
  | { type: "keySplit"; mpcKey: Hex }
  | { type: "recoverySaved"; recoveryKey: Hex }
  | { type: "registered"; address: Hex }
  | { type: "failed"; error: string }
  | { type: "cancelled" }
  | { type: "advance" };

export const initialFlow: Step = { name: "passkey", status: "idle" };

export function flowReducer(step: Step, action: FlowAction): Step {
  switch (action.type) {
    case "start": {
      if (step.status !== "idle") return step;
      const { error, ...rest } = step;
      return { ...rest, status: "working" };
    }
    case "failed":
      if (step.status === "working") return { ...step, status: "idle", error: action.error };
      return step;
    case "cancelled":
      if (step.name === "recovery" && step.status === "working") return { name: "recovery", status: "idle", keys: step.keys };
      return step;
    case "passkeyCreated":
      if (step.name === "passkey" && step.status === "working")
        return { name: "key", status: "idle", keys: { credentialId: action.credentialId } };
      return step;
    case "keySplit":
      if (step.name === "key" && step.status === "working")
        return { name: "key", status: "split", keys: { ...step.keys, mpcKey: action.mpcKey } };
      return step;
    case "advance":
      if (step.name === "key" && step.status === "split") return { name: "recovery", status: "idle", keys: step.keys };
      if (step.name === "setup" && step.status === "registered") return { ...step, status: "ready" };
      return step;
    case "recoverySaved":
      if (step.name === "recovery" && step.status === "working")
        return { name: "setup", status: "working", keys: { ...step.keys, recoveryKey: action.recoveryKey } };
      return step;
    case "registered":
      if (step.name === "setup" && step.status === "working") return { name: "setup", status: "registered", address: action.address };
      return step;
  }
}

/**
 * The beats after real work: the Wallet Key holds while its three shares land, and setup keeps its
 * working copy on screen once W has the keys, since registration usually returns before it can be read.
 */
export function pendingTimer(step: Step): { ms: number; action: FlowAction } | null {
  if (step.name === "key" && step.status === "split") return { ms: 1400, action: { type: "advance" } };
  if (step.name === "setup" && step.status === "registered") return { ms: 1200, action: { type: "advance" } };
  return null;
}

const ORDER: readonly KeyId[] = ["passkey", "key", "recovery"];

export function keyState(step: Step, id: KeyId): "done" | "active" | "pending" {
  if (step.name === "setup") return "done";
  const diff = ORDER.indexOf(id) - ORDER.indexOf(step.name);
  return diff < 0 ? "done" : diff === 0 ? "active" : "pending";
}

const TONES: Record<Step["name"], Tone> = { passkey: "blue", key: "orange", recovery: "violet", setup: "white" };

export function toneOf(step: Step): Tone {
  return TONES[step.name];
}
