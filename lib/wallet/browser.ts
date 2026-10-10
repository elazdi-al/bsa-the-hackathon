// Browser half of the phone SDK: Wallet API calls, the DKLs WebAssembly build and Share A at rest.
//
// Share A lives in IndexedDB, AES-GCM encrypted under the passkey's PRF output, so only a Face ID
// assertion decrypts it and a send needs a single Face ID. Authenticators without PRF get a
// non-extractable WebCrypto key stored beside the ciphertext instead: scripts on this origin can use
// it but never read it out. Production keeps Share A in the Secure Enclave or StrongBox.
import { type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { Passkey } from './account.ts'
import { createPasskey, passkeySigner, runKeyCeremony, signOperation, type Ceremony, type Prepared } from './client.ts'
import type { DklsModule } from './mpc.ts'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, any>,
  ) {
    super(body.error ?? `request failed (${status})`)
  }
}

/** Calls the Wallet API with the Swissquote session cookie, and sends the client to sign in when there is none. */
export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json()
  if (res.status === 401 && path !== '/api/session') location.assign(`/sign-in?${new URLSearchParams({ next: location.pathname })}`)
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

const NAME = 'swissquote:name'

/** MOCKED Swissquote sign-in. */
export async function signIn(email: string, password: string) {
  const { name } = await api<{ name: string }>('POST', '/api/session', { email, password })
  localStorage.setItem(NAME, name)
}

/** MOCKED liveness selfie: the demo's KYC photos are named after the client's first name. */
export const mockSelfie = (impostor = false) =>
  impostor ? 'impostor' : (localStorage.getItem(NAME) ?? '').split(' ')[0].toLowerCase()

let dkls: Promise<DklsModule> | undefined

/** The DKLs23 WebAssembly build, loaded on first use. */
export const loadDkls = () =>
  (dkls ??= import('@silencelaboratories/dkls-wasm-ll-web').then(async (m) => {
    await m.default()
    return m as unknown as DklsModule
  }))

// ---------------------------------------------------------------- Share A

export type DeviceKey = { credentialId: string; passkey: Passkey; key: CryptoKey; prf: boolean }
type ShareRecord = { signer: string; credentialId: string; iv: Uint8Array<ArrayBuffer>; sealed: ArrayBuffer; key?: CryptoKey }

const aesKey = (bytes: BufferSource) => crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
const aad = (signer: string) => new TextEncoder().encode(signer.toLowerCase())
const randomHex = () => `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')}` as Hex

function shares<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open('swissquote-wallet', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('shares', { keyPath: 'signer' })
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const request = run(open.result.transaction('shares', mode).objectStore('shares'))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }
  })
}

/** Face ID creates the device passkey. With PRF, a second Face ID derives the key that encrypts Share A. */
export async function createDeviceKey(): Promise<DeviceKey> {
  // The name also sets the WebAuthn user id: a unique one keeps a recovery passkey from replacing the old one.
  const { id, passkey, prf } = await createPasskey(`Swissquote Wallet ${new Date().toLocaleString()}`)
  let output: BufferSource | undefined
  if (prf) await passkeySigner(id, (o) => (output = o))(randomHex())
  const key = output
    ? await aesKey(output)
    : await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  return { credentialId: id, passkey, key, prf: !!output }
}

/** The 2-of-3 key ceremony with Swissquote and the partner. Stores Share A encrypted; returns the MPC key's address. */
export async function keyCeremony(device: DeviceKey, purpose: 'create' | 'recovery'): Promise<Address> {
  const ceremony = await api<Ceremony>('POST', '/api/wallet/ceremony', { passkey: device.passkey, purpose })
  const { share, signer } = await runKeyCeremony(await loadDkls(), ceremony)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(signer) }, device.key, share as Uint8Array<ArrayBuffer>)
  share.fill(0)
  const record: ShareRecord = { signer: signer.toLowerCase(), credentialId: device.credentialId, iv, sealed }
  if (!device.prf) record.key = device.key
  await shares('readwrite', (s) => s.put(record))
  return signer
}

/** Face ID approves the operation and unlocks Share A; phone and Swissquote co-sign; the Wallet API submits it. */
export async function approve(prepared: Prepared) {
  const record = await shares<ShareRecord | undefined>('readonly', (s) => s.get(prepared.signer.toLowerCase()))
  if (!record) throw new Error('This browser has no Device Key for your wallet. Recover the wallet to use it here.')
  let output: BufferSource | undefined
  const share = async () => {
    const key = record.key ?? (output && (await aesKey(output)))
    if (!key) throw new Error('Face ID did not unlock your Device Key')
    const params = { name: 'AES-GCM', iv: record.iv, additionalData: aad(record.signer) }
    return new Uint8Array(await crypto.subtle.decrypt(params, key, record.sealed))
  }
  const sign = passkeySigner(record.credentialId, (o) => (output = o))
  const signature = await signOperation(await loadDkls(), share, prepared, sign)
  await api('POST', `/api/wallet/operations/${prepared.hash}`, { signature })
}

export type Operation = { status: 'pending' } | { status: 'completed' | 'failed'; transactionHash: Hex; reason: string | null }

/** Polls the bundler, through the Wallet API, until the operation is on-chain. A failed poll is retried: it was already submitted. */
export async function settled(hash: Hex, signal?: AbortSignal) {
  for (;;) {
    const op = await api<Operation>('GET', `/api/wallet/operations/${hash}`).catch((): Operation => ({ status: 'pending' }))
    if (op.status !== 'pending' || signal?.aborted) return op
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

// ---------------------------------------------------------------- Recovery Kit

/** Registers the wallet with a new confirmation key. Its Recovery Kit is the only copy: the client keeps it at home. */
export async function registerWallet(signer: Address, passkey: Passkey) {
  const key = generatePrivateKey()
  const { address } = await api<{ address: Address }>('POST', '/api/wallet', {
    signer,
    passkey,
    confirmationKey: privateKeyToAccount(key).address,
  })
  const kit = [
    'Swissquote Wallet Recovery Kit',
    '',
    `Wallet: ${address}`,
    `Recovery key: ${key}`,
    '',
    'Keep this at home, offline. With an ID check, it restores your wallet on a new phone.',
  ].join('\n')
  return { address, kit }
}

/** The recovery key in a pasted or uploaded Recovery Kit. */
export const kitKey = (text: string) => text.match(/0x[0-9a-fA-F]{64}/)?.[0] as Hex | undefined

/**
 * Recovery on this browser, after the identity check: a new passkey and key ceremony, then an
 * initiateRecovery operation that the Recovery Kit confirms and Swissquote and the partner co-sign.
 */
export async function startRecovery(kit: Hex) {
  const confirmation = privateKeyToAccount(kit)
  const device = await createDeviceKey()
  const signer = await keyCeremony(device, 'recovery')
  const { hash } = await api<{ hash: Hex }>('POST', '/api/wallet/operations', { recovery: { signer, passkey: device.passkey } })
  await api('POST', `/api/wallet/operations/${hash}`, { confirmationSignature: await confirmation.sign({ hash }) })
  const op = await settled(hash)
  if (op.status === 'failed') throw new Error(`The recovery was refused on-chain: ${op.reason}`)
}
