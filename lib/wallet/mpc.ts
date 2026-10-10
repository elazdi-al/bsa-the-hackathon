import { schnorr, secp256k1_FROST as F } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js";
import { fromHex, toHex, type Hex } from "./protocol.ts";

export type Participant = "phone" | "swissquote" | "backup";
export type Provider = Exclude<Participant, "phone">;
export const PROVIDERS: readonly Provider[] = ["swissquote", "backup"];

export const SIGNERS = { min: 2, max: 3 };
export const ID: Record<Participant, string> = {
  phone: F.Identifier.fromNumber(1),
  swissquote: F.Identifier.fromNumber(2),
  backup: F.Identifier.fromNumber(3),
};

export type Key = ReturnType<typeof F.DKG.round3>;
export type DkgSecret = ReturnType<typeof F.DKG.round1>["secret"];
export type Round1 = ReturnType<typeof F.DKG.round1>["public"];
export type Round2 = ReturnType<typeof F.DKG.round2>[string];
export type Commitments = ReturnType<typeof F.commit>["commitments"];

/** A FROST value with its bigints and byte arrays made JSON-safe; `T` records what `unpack` gives back. */
export type Packed<T> = { readonly __packed?: T };

export type KeygenTransport = {
  keygen(round1: Packed<Round1>): Promise<{ token: string; round1: Record<Provider, Packed<Round1>>; round2: Record<Provider, Packed<Round2>> }>;
  finish(token: string, round2: Record<Provider, Packed<Round2>>): Promise<{ mpcKey: Hex }>;
};

export type CosignReply = { commitments: Commitments; share: Uint8Array };

export function pack<T>(value: T): Packed<T> {
  const walk = (v: unknown): unknown => {
    if (typeof v === "bigint") return { $big: v.toString() };
    if (v instanceof Uint8Array) return { $hex: bytesToHex(v) };
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as Packed<T>;
}

export function unpack<T>(value: Packed<T>): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      if ("$big" in v && typeof v.$big === "string") return BigInt(v.$big);
      if ("$hex" in v && typeof v.$hex === "string") return hexToBytes(v.$hex);
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}

export function groupKey(key: Key): Hex {
  return toHex(key.public.commitments[0]);
}

/** The phone's side of the DKG. Keeps P and resolves to it; the providers keep S and B. */
export async function phoneKeygen(api: KeygenTransport): Promise<Key> {
  const mine = F.DKG.round1(ID.phone, SIGNERS);
  const reply = await api.keygen(pack(mine.public));
  const theirs = PROVIDERS.map((p) => unpack(reply.round1[p]));
  const toThem = F.DKG.round2(mine.secret, theirs);
  const key = F.DKG.round3(mine.secret, theirs, PROVIDERS.map((p) => unpack(reply.round2[p])));
  const { mpcKey } = await api.finish(reply.token, { swissquote: pack(toThem[ID.swissquote]), backup: pack(toThem[ID.backup]) });
  if (mpcKey !== groupKey(key)) throw new Error("The providers derived a different group key.");
  return key;
}

/** A provider's reply to the phone's round-1 commitments: its own commitments and its signature share. */
export function cosignShare(key: Key, message: Uint8Array, theirs: Commitments): CosignReply {
  const mine = F.commit(key.secret);
  const share = F.signShare(key.secret, key.public, mine.nonces, [theirs, mine.commitments], message);
  return { commitments: mine.commitments, share };
}

/** The phone's side of a two-party signature: commit, ask the remote share, aggregate. */
export async function cosignWith(key: Key, message: Uint8Array, remote: (mine: Commitments) => Promise<CosignReply>): Promise<Hex> {
  const mine = F.commit(key.secret);
  const theirs = await remote(mine.commitments);
  const commitments = [mine.commitments, theirs.commitments];
  const share = F.signShare(key.secret, key.public, mine.nonces, commitments, message);
  return aggregate(key, commitments, message, { [key.secret.identifier]: share, [theirs.commitments.identifier]: theirs.share });
}

/** A signature from shares that are all in hand: S+B on the server, or P plus a local copy of B. */
export function signTogether(message: Uint8Array, keys: Key[]): Hex {
  const nonces = keys.map((k) => F.commit(k.secret));
  const commitments = nonces.map((n) => n.commitments);
  const shares = Object.fromEntries(keys.map((k, i) => [k.secret.identifier, F.signShare(k.secret, k.public, nonces[i].nonces, commitments, message)]));
  return aggregate(keys[0], commitments, message, shares);
}

function aggregate(key: Key, commitments: Commitments[], message: Uint8Array, shares: Record<string, Uint8Array>): Hex {
  const signature = F.aggregate(key.public, commitments, message, shares);
  if (!F.verify(signature, message, key.public.commitments[0])) throw new Error("The signature shares do not combine.");
  return toHex(signature);
}

export function createRecoveryKey(): { secret: Hex; publicKey: Hex } {
  const secret = schnorr.utils.randomSecretKey();
  return { secret: toHex(secret), publicKey: toHex(schnorr.getPublicKey(secret)) };
}

export function signWithRecoveryKey(message: Uint8Array, secret: Hex): Hex {
  return toHex(schnorr.sign(message, fromHex(secret)));
}
