// Phone side, isomorphic (the browser and scripts). The phone generates the wallet key, splits it
// 2-of-3 with Shamir and keeps Share A: store it encrypted (passkey PRF, Keychain or Keystore in
// production). To sign, it rebuilds the key from Share A and Share B, which Swissquote releases
// for an operation the passkey approved.
import { WebAuthnP256 } from 'ox'
import { isAddressEqual, numberToHex, type Address, type Hex, type LocalAccount } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { encodeNormalSignature, encodeRecoverySignature, type Passkey, type PasskeyAssertion } from './account.ts'
import { combine, split, type Share } from './shamir.ts'
import type { Ticket } from './tickets.ts'

export type PasskeySigner = (challenge: Hex) => Promise<PasskeyAssertion>

/** Input for the passkey's PRF: the same salt always yields the same 32 bytes, the key to Share A. */
export const PRF_SALT = new TextEncoder().encode('Swissquote Wallet Share A v1')

/** Creates the phone passkey (Face ID). Keep `id` to sign with it later. `prf`: it can derive a key (WebAuthn PRF). */
export async function createPasskey(name: string): Promise<{ id: string; passkey: Passkey; prf: boolean }> {
  const credential = await WebAuthnP256.createCredential({ name, extensions: { prf: { eval: { first: PRF_SALT } } } })
  const { x, y } = credential.publicKey
  return {
    id: credential.id,
    passkey: { x: numberToHex(x, { size: 32 }), y: numberToHex(y!, { size: 32 }) },
    prf: !!credential.raw.getClientExtensionResults().prf?.enabled,
  }
}

/** Face ID over `challenge`. `onPrf` receives the passkey's PRF output, when the authenticator supports it. */
export const passkeySigner =
  (credentialId: string, onPrf?: (output: BufferSource | undefined) => void): PasskeySigner =>
  async (challenge) => {
    const { metadata, signature, raw } = await WebAuthnP256.sign({
      challenge,
      credentialId,
      extensions: { prf: { eval: { first: PRF_SALT } } },
    })
    onPrf?.(raw.getClientExtensionResults().prf?.results?.first)
    return { metadata, signature }
  }

export type Services = { swissquote: string; partner: string }

/** Response of POST /api/wallet/ceremony. */
export type Ceremony = { ticket: Ticket<'Ceremony'>; services: Services }

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `${url}: ${res.status}`)
  return data
}

/** A new wallet key, split 2-of-3: Share B to Swissquote, C to the independent service, A returned for the phone. */
export async function createKey({ ticket, services }: Ceremony): Promise<{ share: Share; signer: Address }> {
  const key = generatePrivateKey()
  const signer = privateKeyToAccount(key).address
  const [a, b, c] = split(key)
  await Promise.all([
    post(`${services.swissquote}/shares/${signer}`, { ticket, share: b }),
    post(`${services.partner}/shares/${signer}`, { ticket, share: c }),
  ])
  return { share: a, signer }
}

/** Response of POST /api/wallet/operations: the sponsored UserOperation and the key that must sign it. */
export type Prepared = { hash: Hex; userOp: Record<string, unknown>; signer: Address; services: Services }

type Proof = { assertion: PasskeyAssertion } | { confirmationSignature: Hex }

/** A share service releases its share of the wallet key for this operation, once its checks pass. */
async function release(url: string, prepared: Prepared, proof: Proof): Promise<Share> {
  const body =
    'assertion' in proof
      ? {
          assertion: {
            metadata: proof.assertion.metadata,
            signature: { r: numberToHex(proof.assertion.signature.r), s: numberToHex(proof.assertion.signature.s) },
          },
        }
      : proof
  return (await post<{ share: Share }>(`${url}/shares/${prepared.signer}/release`, { userOp: prepared.userOp, ...body })).share
}

/** Any two shares rebuild the wallet key; checked against the wallet's signer. */
export function rebuildKey(a: Share, b: Share, signer: Address): Hex {
  const key = combine(a, b)
  if (!isAddressEqual(privateKeyToAccount(key).address, signer)) throw new Error('these shares do not rebuild your wallet key')
  return key
}

/** Share B, released by Swissquote for an operation this passkey assertion approved. */
export const releaseShareB = (prepared: Prepared, assertion: PasskeyAssertion) =>
  release(prepared.services.swissquote, prepared, { assertion })

/** MODE_NORMAL: the wallet key and the passkey assertion, both over the userOpHash. */
export async function signNormal(prepared: Prepared, key: Hex, assertion: PasskeyAssertion) {
  return encodeNormalSignature(await privateKeyToAccount(key).sign({ hash: prepared.hash }), assertion)
}

/**
 * MODE_RECOVERY, on a new phone: the recovery key from home confirms the operation, then Swissquote
 * (Share B) and the independent service (Share C) each check that and release their share. Together
 * they rebuild the wallet key, which signs.
 */
export async function signRecovery(prepared: Prepared, recoveryKey: LocalAccount) {
  const confirmationSignature = await recoveryKey.sign!({ hash: prepared.hash })
  const [b, c] = await Promise.all([
    release(prepared.services.swissquote, prepared, { confirmationSignature }),
    release(prepared.services.partner, prepared, { confirmationSignature }),
  ])
  const key = rebuildKey(b, c, prepared.signer)
  return encodeRecoverySignature(await privateKeyToAccount(key).sign({ hash: prepared.hash }), confirmationSignature)
}
