// 2-of-3 Shamir sharing of the wallet key over the secp256k1 group order. The line
// f(x) = key + a·x gives Share A at x = 1 (phone), B at x = 2 (Swissquote) and C at x = 3
// (partner). Feldman commitments (key·G, a·G) let each holder check its share belongs to
// the wallet key before storing it, so a bad split cannot silently break recovery.
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes, type Address, type Hex } from "viem";
import { publicKeyToAddress } from "viem/accounts";

const { Point } = secp256k1;
const { Fn } = Point;

export const HOLDERS = { phone: 1, swissquote: 2, partner: 3 } as const;
export type Holder = keyof typeof HOLDERS;
export type Share = { x: (typeof HOLDERS)[Holder]; y: Hex };
export type Commitments = readonly [Hex, Hex];

const scalar = (value: Hex) => Fn.fromBytes(hexToBytes(value));
const encode = (value: bigint) => bytesToHex(Fn.toBytes(value));
const point = (value: Hex) => Point.fromHex(value.slice(2));
const random = () => Fn.fromBytes(secp256k1.utils.randomSecretKey());

export function split(): { key: Hex; shares: Record<Holder, Share>; commitments: Commitments } {
  const key = random();
  const a = random();
  const share = (x: Share["x"]): Share => ({ x, y: encode(Fn.add(key, Fn.mul(a, BigInt(x)))) });
  return {
    key: encode(key),
    shares: { phone: share(HOLDERS.phone), swissquote: share(HOLDERS.swissquote), partner: share(HOLDERS.partner) },
    commitments: [bytesToHex(Point.BASE.multiply(key).toBytes()), bytesToHex(Point.BASE.multiply(a).toBytes())],
  };
}

/** The key, interpolated at x = 0 from any two shares. */
export function combine(first: Share, second: Share): Hex {
  if (first.x === second.x) throw new Error("Two different shares are needed.");
  const [x1, x2] = [BigInt(first.x), BigInt(second.x)];
  const numerator = Fn.sub(Fn.mul(scalar(first.y), x2), Fn.mul(scalar(second.y), x1));
  return encode(Fn.div(numerator, Fn.sub(x2, x1)));
}

export function verifyShare(share: Share, [keyCommitment, slopeCommitment]: Commitments): boolean {
  try {
    const expected = point(keyCommitment).add(point(slopeCommitment).multiply(BigInt(share.x)));
    return Point.BASE.multiply(scalar(share.y)).equals(expected);
  } catch {
    return false;
  }
}

/** The address the account checks the key's signatures against. */
export function signerOf([keyCommitment]: Commitments): Address {
  return publicKeyToAddress(bytesToHex(point(keyCommitment).toBytes(false)));
}
