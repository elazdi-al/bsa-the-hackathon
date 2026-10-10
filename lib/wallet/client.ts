// Phone side (Share A). In the browser pass `@silencelaboratories/dkls-wasm-ll-web` after
// `await init()`; scripts pass the -node package. Share A never leaves the phone: store it
// encrypted (passkey PRF, Keychain or Keystore in production).
import { WebAuthnP256 } from 'ox'
import { numberToHex, type Address, type Hex } from 'viem'
import { encodeNormalSignature, type Passkey, type PasskeyAssertion } from './account.ts'
import {
  KEYGEN_STEPS,
  keygenParty,
  PARTNER,
  PHONE,
  remoteParty,
  run,
  SIGN_STEPS,
  signerAddress,
  signParty,
  SWISSQUOTE,
  toEthSignature,
  type DklsModule,
} from './mpc.ts'
import type { Ticket } from './tickets.ts'

export type PasskeySigner = (challenge: Hex) => Promise<PasskeyAssertion>

/** Input for the passkey's PRF: the same salt always yields the same 32 bytes, the key to Share A. */
export const PRF_SALT = new TextEncoder().encode('Swissquote Wallet Share A v1')

/** Creates the device passkey (Face ID). Keep `id` to sign with it later. `prf`: it can derive a key (WebAuthn PRF). */
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

/** Response of POST /api/wallet/ceremony. */
export type Ceremony = { ticket: Ticket<'Ceremony'>; signers: { swissquote: string; partner: string } }

/** Runs the 2-of-3 key ceremony with Swissquote and the partner. */
export async function runKeyCeremony(dkls: DklsModule, { ticket, signers }: Ceremony) {
  const id = ticket.message.ceremonyId
  const phone = keygenParty(dkls, PHONE)
  const [result] = await run(
    [
      phone,
      remoteParty(SWISSQUOTE, `${signers.swissquote}/keygen/${id}`, { ticket }),
      remoteParty(PARTNER, `${signers.partner}/keygen/${id}`, { ticket }),
    ],
    KEYGEN_STEPS,
  )
  return { share: phone.keyshare()!, signer: signerAddress(result.publicKey!) }
}

/** Response of POST /api/wallet/operations for a normal operation. */
export type Prepared = { hash: Hex; userOp: Record<string, unknown>; signer: Address; cosigner: string }

/**
 * Face ID approves the exact operation, then phone and Swissquote produce the MPC signature.
 * `share` may be a function, read after Face ID: the browser decrypts Share A with that assertion's PRF output.
 */
export async function signOperation(
  dkls: DklsModule,
  share: Uint8Array | (() => Promise<Uint8Array>),
  prepared: Prepared,
  sign: PasskeySigner,
) {
  const assertion = await sign(prepared.hash)
  const keyshare = typeof share === 'function' ? await share() : share
  const request = {
    kind: 'normal',
    signer: prepared.signer,
    userOp: prepared.userOp,
    assertion: { metadata: assertion.metadata, signature: { r: numberToHex(assertion.signature.r), s: numberToHex(assertion.signature.s) } },
  }
  const [result] = await run(
    [signParty(dkls, keyshare, prepared.hash), remoteParty(SWISSQUOTE, `${prepared.cosigner}/sign/${crypto.randomUUID()}`, { request })],
    SIGN_STEPS,
  )
  const mpcSignature = await toEthSignature(result.signature!, prepared.hash, prepared.signer)
  return encodeNormalSignature(mpcSignature, assertion)
}
