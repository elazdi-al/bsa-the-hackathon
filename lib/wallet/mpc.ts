// 2-of-3 threshold ECDSA (DKLs23, Silence Labs) for the wallet's signer key.
//
// Party ids: 0 = phone (Share A), 1 = Swissquote (Share B), 2 = independent partner (Share C).
// Every party exposes the same `step` function whether it runs in this process or behind
// HTTP, so one orchestrator drives keygen on the phone (A + B + C), normal signing on the
// phone (A + B) and recovery signing in the Wallet API (B + C).
import type * as Dkls from '@silencelaboratories/dkls-wasm-ll-node'
import { Secp256k1 } from 'ox'
import { hexToBytes, recoverAddress, serializeSignature, toHex, type Address, type Hex } from 'viem'
import { publicKeyToAddress } from 'viem/accounts'

/** The -node and -web packages share this API; the web one needs `await init()` first. */
export type DklsModule = typeof Dkls

export const PHONE = 0
export const SWISSQUOTE = 1
export const PARTNER = 2

export const KEYGEN_STEPS = 5
export const SIGN_STEPS = 5

export type Wire = { from: number; to?: number; payload: string }

export type StepResult = {
  messages: Wire[]
  commitment?: string
  publicKey?: Hex // keygen, last step
  signature?: { r: Hex; s: Hex } // signing, last step
}

export type Party = {
  id: number
  step(step: number, inbox: Wire[], commitments: string[]): Promise<StepResult>
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

function toWire(m: Dkls.Message): Wire {
  const wire = { from: m.from_id, to: m.to_id, payload: b64(m.payload) }
  m.free()
  return wire
}

function fromWire(dkls: DklsModule, w: Wire): Dkls.Message {
  return new dkls.Message(unb64(w.payload), w.from, w.to)
}

/** Runs a protocol to completion. `parties` must be sorted by id (commitment order). */
export async function run(parties: Party[], steps: number): Promise<StepResult[]> {
  let pool: Wire[] = []
  let commitments: string[] = []
  let results: StepResult[] = []
  for (let step = 0; step < steps; step++) {
    results = await Promise.all(
      parties.map((p) =>
        p.step(step, pool.filter((m) => m.from !== p.id && (m.to === undefined || m.to === p.id)), commitments),
      ),
    )
    pool = results.flatMap((r) => r.messages)
    if (results.every((r) => r.commitment)) commitments = results.map((r) => r.commitment!)
  }
  return results
}

/** One party of a 2-of-3 key generation. `keyshare()` is set after the last step. */
export function keygenParty(dkls: DklsModule, id: number) {
  const session = new dkls.KeygenSession(3, 2, id)
  let keyshare: Uint8Array | undefined
  const party: Party & { keyshare: () => Uint8Array | undefined } = {
    id,
    keyshare: () => keyshare,
    async step(step, inbox, commitments) {
      const msgs = inbox.map((w) => fromWire(dkls, w))
      switch (step) {
        case 0:
          return { messages: [toWire(session.createFirstMessage())] }
        case 1: {
          const messages = session.handleMessages(msgs).map(toWire)
          return { messages, commitment: b64(session.calculateChainCodeCommitment()) }
        }
        case 2:
          return { messages: session.handleMessages(msgs).map(toWire) }
        case 3:
          return { messages: session.handleMessages(msgs, commitments.map(unb64)).map(toWire) }
        case 4: {
          session.handleMessages(msgs)
          const share = session.keyshare()
          keyshare = share.toBytes()
          const publicKey = toHex(share.publicKey)
          share.free()
          return { messages: [], publicKey }
        }
      }
      throw new Error(`keygen has no step ${step}`)
    },
  }
  return party
}

/** One party of a 2-party signature over `hash` with an existing share. */
export function signParty(dkls: DklsModule, keyshare: Uint8Array, hash: Hex): Party {
  const share = dkls.Keyshare.fromBytes(keyshare)
  const id = share.partyId
  const session = new dkls.SignSession(share, 'm') // consumes the share
  return {
    id,
    async step(step, inbox) {
      const msgs = inbox.map((w) => fromWire(dkls, w))
      switch (step) {
        case 0:
          return { messages: [toWire(session.createFirstMessage())] }
        case 1:
        case 2:
          return { messages: session.handleMessages(msgs).map(toWire) }
        case 3:
          session.handleMessages(msgs) // pre-signature ready; it is used once, right here
          return { messages: [toWire(session.lastMessage(hexToBytes(hash)))] }
        case 4: {
          const [r, s] = session.combine(msgs) as [Uint8Array, Uint8Array]
          return { messages: [], signature: { r: toHex(r), s: toHex(s) } }
        }
      }
      throw new Error(`signing has no step ${step}`)
    },
  }
}

/** A party behind HTTP: POSTs `{ step, inbox, commitments, ...extra }` to `url`. */
export function remoteParty(id: number, url: string, extra: Record<string, unknown> = {}): Party {
  return {
    id,
    async step(step, inbox, commitments) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...extra, step, inbox, commitments }),
      })
      if (!res.ok) throw new Error(`party ${id}: ${res.status} ${await res.text()}`)
      return res.json()
    },
  }
}

/** Address of the MPC key (compressed secp256k1 public key from the keyshare). */
export function signerAddress(publicKey: Hex): Address {
  const point = Secp256k1.noble.ProjectivePoint.fromHex(publicKey.slice(2))
  return publicKeyToAddress(`0x${point.toHex(false)}`)
}

const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n

/** Turns the protocol's (r, s) into a 65-byte low-s Ethereum signature by `signer`. */
export async function toEthSignature(sig: { r: Hex; s: Hex }, hash: Hex, signer: Address): Promise<Hex> {
  let s = BigInt(sig.s)
  if (s > SECP256K1_N / 2n) s = SECP256K1_N - s
  for (const yParity of [0, 1]) {
    const candidate = serializeSignature({ r: sig.r, s: toHex(s, { size: 32 }), yParity })
    if ((await recoverAddress({ hash, signature: candidate })) === signer) return candidate
  }
  throw new Error('MPC signature does not match the wallet key')
}
