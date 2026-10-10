import { schnorr, secp256k1_FROST as F } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

export type Hex = `0x${string}`;
export const RECOVERY_DELAY = 48 * 60 * 60;

/** `publicKey` is the COSE key in base64, exactly as better-auth's passkey table stores it. */
export type Passkey = { credentialId: string; publicKey: string };
export type Credentials = { mpcKey: Hex; passkey: Passkey; recoveryKey: Hex };

type Scope = { wallet: Hex; chainId: number; version: number };
type Change = Scope & { id: string; replacement: Credentials; expiresAt: number };

/** Everything that can be submitted to W. A signature binds every field through `digest`. */
export type Call =
  | (Scope & {
      type: "execute";
      nonce: number;
      to: Hex;
      value: string;
      data: Hex;
      fees: { maxFeePerGas: string; maxPriorityFeePerGas: string; callGasLimit: string };
      validAfter: number;
      validUntil: number;
    })
  | (Change & { type: "recover" | "maintain" })
  | (Scope & { type: "cancel"; id: string })
  | { type: "finalize"; wallet: Hex; id: string };

export type Proof = { mpc?: Hex; passkey?: AuthenticationResponseJSON; recovery?: Hex };

export type ChangeRequest = Extract<Call, { type: "recover" | "maintain" }> & { registeredAt: number };

export type Wallet = {
  address: Hex;
  chainId: number;
  /** The WebAuthn RP identity W accepts, fixed at deployment. */
  rp: { id: string; origin: string };
  version: number;
  nonce: number;
  credentials: Credentials;
  pending: ChangeRequest | null;
  /** Every change-request id W has ever registered, so a cancelled request cannot be replayed. */
  requests: string[];
};

export type Factor = "mpc" | "passkey" | "recovery";

/** Who must sign what. Each entry lists alternatives; each alternative lists factors that must all verify. */
export const RULES = {
  execute: [["mpc", "passkey"]],
  maintain: [["mpc", "passkey"]],
  recover: [["mpc", "recovery"]],
  cancel: [["passkey"], ["recovery"]],
  finalize: [[]],
} as const satisfies Record<Call["type"], readonly (readonly Factor[])[]>;

export const ERROR = {
  WRONG_WALLET: "The call is addressed to another wallet.",
  WRONG_CHAIN: "The call is for another chain.",
  STALE_VERSION: "The call was signed against another credential version.",
  BAD_NONCE: "The call's nonce is not the wallet's next nonce.",
  OUTSIDE_VALIDITY: "The call is outside its validity window.",
  SPENDING_SUSPENDED: "Spending is suspended while a recovery is pending.",
  CHANGE_PENDING: "Another credential change is already pending.",
  REQUEST_REUSED: "That request id was already registered.",
  EXPIRY_TOO_SOON: "The request would expire before the delay elapses.",
  NO_SUCH_REQUEST: "No pending request has that id.",
  DELAY_NOT_ELAPSED: "The delay has not elapsed.",
  REQUEST_EXPIRED: "The request has expired.",
  UNAUTHORIZED: "The proof does not authorize this call.",
} as const;

export type Code = keyof typeof ERROR;

export class ProtocolError extends Error {
  code: Code;
  constructor(code: Code) {
    super(ERROR[code]);
    this.name = "ProtocolError";
    this.code = code;
  }
}

export function toHex(bytes: Uint8Array): Hex {
  return `0x${bytesToHex(bytes)}`;
}

export function fromHex(hex: Hex): Uint8Array {
  return hexToBytes(hex.slice(2));
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const hash = (value: unknown) => keccak_256(new TextEncoder().encode(canonical(value)));

/** The digest as the WebAuthn challenge, encoded the same way on the phone and in W. */
export function challenge(message: Uint8Array): string {
  return btoa(String.fromCharCode(...message)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const fromBase64 = (data: string) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

// ponytail: keccak over canonical JSON stands in for an EIP-712 typed hash; swap in the typed-data encoding when W moves on-chain.
export function digest(call: Call): Uint8Array {
  return hash(call);
}

// ponytail: the last 20 bytes of a hash stand in for a CREATE2 counterfactual address; the factory's salt derivation replaces it on-chain.
export function walletAddress(chainId: number, credentials: Credentials): Hex {
  return toHex(hash({ chainId, credentials }).slice(12));
}

export function deploy(chainId: number, rp: Wallet["rp"], credentials: Credentials): Wallet {
  return { address: walletAddress(chainId, credentials), chainId, rp, version: 1, nonce: 0, credentials, pending: null, requests: [] };
}

async function verifies(w: Wallet, factor: Factor, message: Uint8Array, proof: Proof): Promise<boolean> {
  try {
    switch (factor) {
      case "mpc":
        return !!proof.mpc && F.verify(fromHex(proof.mpc), message, fromHex(w.credentials.mpcKey));
      case "recovery":
        return !!proof.recovery && schnorr.verify(fromHex(proof.recovery), message, fromHex(w.credentials.recoveryKey));
      case "passkey": {
        const { credentialId, publicKey } = w.credentials.passkey;
        if (!proof.passkey || proof.passkey.id !== credentialId) return false;
        // Imported lazily so the phone bundle, which only builds proofs, never carries the verifier.
        const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
        // Replay protection is the nonce inside the digest, so the signature counter stays at zero.
        const { verified } = await verifyAuthenticationResponse({
          response: proof.passkey,
          expectedChallenge: challenge(message),
          expectedOrigin: w.rp.origin,
          expectedRPID: w.rp.id,
          requireUserVerification: true,
          credential: { id: credentialId, publicKey: fromBase64(publicKey), counter: 0 },
        });
        return verified;
      }
    }
  } catch {
    return false;
  }
}

async function authorized(w: Wallet, call: Call, proof: Proof, alternatives: readonly (readonly Factor[])[]): Promise<boolean> {
  const message = digest(call);
  for (const factors of alternatives) {
    const checks = await Promise.all(factors.map((factor) => verifies(w, factor, message, proof)));
    if (checks.every(Boolean)) return true;
  }
  return false;
}

/** True when the user factors of some alternative verify. Providers gate on this before lending a share. */
export function userAuthorized(w: Wallet, call: Call, proof: Proof): Promise<boolean> {
  return authorized(w, call, proof, RULES[call.type].map((factors) => factors.filter((f) => f !== "mpc")));
}

function fail(code: Code): never {
  throw new ProtocolError(code);
}

export async function submit(w: Wallet, call: Call, proof: Proof, now: number): Promise<Wallet> {
  if (call.wallet !== w.address) fail("WRONG_WALLET");
  if (call.type !== "finalize") {
    if (call.chainId !== w.chainId) fail("WRONG_CHAIN");
    if (call.version !== w.version) fail("STALE_VERSION");
  }
  const pending = w.pending && now <= w.pending.expiresAt ? w.pending : null;
  switch (call.type) {
    case "execute":
      if (pending?.type === "recover") fail("SPENDING_SUSPENDED");
      if (call.nonce !== w.nonce) fail("BAD_NONCE");
      if (now < call.validAfter || now > call.validUntil) fail("OUTSIDE_VALIDITY");
      break;
    case "recover":
    case "maintain":
      if (pending) fail("CHANGE_PENDING");
      if (w.requests.includes(call.id)) fail("REQUEST_REUSED");
      if (call.expiresAt <= now + RECOVERY_DELAY) fail("EXPIRY_TOO_SOON");
      break;
    case "cancel":
      if (pending?.id !== call.id) fail("NO_SUCH_REQUEST");
      break;
    case "finalize":
      if (w.pending?.id !== call.id) fail("NO_SUCH_REQUEST");
      if (!pending) fail("REQUEST_EXPIRED");
      if (now < pending.registeredAt + RECOVERY_DELAY) fail("DELAY_NOT_ELAPSED");
      break;
  }
  if (!(await authorized(w, call, proof, RULES[call.type]))) fail("UNAUTHORIZED");
  switch (call.type) {
    case "execute":
      return { ...w, nonce: w.nonce + 1 };
    case "recover":
    case "maintain":
      return { ...w, pending: { ...call, registeredAt: now }, requests: [...w.requests, call.id] };
    case "cancel":
      return { ...w, pending: null };
    case "finalize":
      return { ...w, credentials: pending!.replacement, version: w.version + 1, pending: null };
  }
}
