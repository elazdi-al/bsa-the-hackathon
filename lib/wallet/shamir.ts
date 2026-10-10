// 2-of-3 Shamir secret sharing of the wallet key, over the secp256k1 group order.
//
// Share A (x = 1) stays on the phone, Share B (x = 2) with Swissquote, Share C (x = 3) with the
// independent service. Any two rebuild the key, which then signs; one share alone reveals nothing.
import { concat, hexToBigInt, numberToHex, slice, type Hex } from 'viem'
import { generatePrivateKey } from 'viem/accounts'

export const PHONE = 1
export const SWISSQUOTE = 2
export const PARTNER = 3

/** One byte x (the holder above), then 32 bytes y. */
export type Share = Hex

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
const mod = (a: bigint) => ((a % N) + N) % N

/** a^(N-2): the inverse mod the prime N. */
function inverse(a: bigint) {
  let result = 1n
  for (let base = mod(a), e = N - 2n; e; e >>= 1n, base = (base * base) % N) if (e & 1n) result = (result * base) % N
  return result
}

export const holder = (share: Share) => Number(slice(share, 0, 1))

/** f(x) = key + r·x with a fresh random r: a line through the key, one point per holder. */
export function split(key: Hex): [a: Share, b: Share, c: Share] {
  const [k, r] = [hexToBigInt(key), hexToBigInt(generatePrivateKey())]
  const point = (x: number) => concat([numberToHex(x, { size: 1 }), numberToHex(mod(k + r * BigInt(x)), { size: 32 })])
  return [point(PHONE), point(SWISSQUOTE), point(PARTNER)]
}

/** Lagrange interpolation at x = 0 from two distinct shares. */
export function combine(a: Share, b: Share): Hex {
  const [x1, x2] = [BigInt(holder(a)), BigInt(holder(b))]
  if (x1 === x2) throw new Error('two different shares are needed')
  const [y1, y2] = [hexToBigInt(slice(a, 1)), hexToBigInt(slice(b, 1))]
  return numberToHex(mod(y1 * x2 * inverse(x2 - x1) + y2 * x1 * inverse(x1 - x2)), { size: 32 })
}
