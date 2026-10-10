// Browser half of the phone SDK: Wallet API calls, Share A at rest and the wallet key cache.
//
// Share A lives in IndexedDB, AES-GCM encrypted under the passkey's PRF output, so only a Face ID
// assertion decrypts it and a send needs a single Face ID. Authenticators without PRF get a
// non-extractable WebCrypto key stored beside the ciphertext instead: scripts on this origin can use
// it but never read it out. Production keeps Share A in the Secure Enclave or StrongBox.
import { bytesToHex, encodeFunctionData, hexToBytes, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { accountAbi, kitProof, type Passkey } from './account.ts'
import {
  createKey,
  createPasskey,
  passkeySigner,
  rebuildKey,
  releaseShareB,
  signNormal,
  signRecovery,
  type Ceremony,
  type Prepared,
} from './client.ts'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, any>,
  ) {
    super(body.error ?? `request failed (${status})`)
  }
}

/** Calls the Wallet API with this browser's wallet session. 401: no wallet here yet. */
export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

// ---------------------------------------------------------------- Share A

export type DeviceKey = { credentialId: string; passkey: Passkey; key: CryptoKey; prf: boolean }
type ShareRecord = { signer: string; credentialId: string; iv: Uint8Array<ArrayBuffer>; sealed: ArrayBuffer; key?: CryptoKey }

const aesKey = (bytes: BufferSource) => crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
const aad = (signer: string) => new TextEncoder().encode(signer.toLowerCase())

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

/** Face ID creates the phone passkey. With PRF, a second Face ID derives the key that encrypts Share A. */
export async function createDeviceKey(): Promise<DeviceKey> {
  // The name also sets the WebAuthn user id: a unique one keeps a recovery passkey from replacing the old one.
  const { id, passkey, prf } = await createPasskey(`Swissquote Wallet ${new Date().toLocaleString()}`)
  let output: BufferSource | undefined
  if (prf) await passkeySigner(id, (o) => (output = o))(generatePrivateKey())
  const key = output
    ? await aesKey(output)
    : await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  return { credentialId: id, passkey, key, prf: !!output }
}

/** A new wallet key, split 2-of-3: B to Swissquote, C to the independent service, A stored here encrypted. Returns its address. */
export async function keyCeremony(device: DeviceKey, purpose: 'create' | 'recovery'): Promise<Address> {
  const { share, signer } = await createKey(await api<Ceremony>('POST', '/api/wallet/ceremony', { passkey: device.passkey, purpose }))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(signer) }, device.key, hexToBytes(share) as Uint8Array<ArrayBuffer>)
  const record: ShareRecord = { signer: signer.toLowerCase(), credentialId: device.credentialId, iv, sealed }
  if (!device.prf) record.key = device.key
  await shares('readwrite', (s) => s.put(record))
  return signer
}

/** True when this browser holds Share A and the passkey for the wallet key `signer`. */
export const hasDeviceKey = async (signer: Address) => !!(await shares('readonly', (s) => s.count(signer.toLowerCase())))

// ---------------------------------------------------------------- wallet key cache

/** How long the wallet key, once rebuilt from Shares A + B, may sign without rebuilding it. */
const KEY_TTL = 5 * 60_000

// In memory only, never stored: it is gone when the app closes, and cleared after KEY_TTL.
let cached: { signer: string; key: Hex; timer: ReturnType<typeof setTimeout> } | undefined

export function forgetKey() {
  clearTimeout(cached?.timer)
  cached = undefined
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', forgetKey)

/**
 * Face ID approves the exact operation. Without a cached wallet key, the same assertion unlocks
 * Share A and gets Share B from Swissquote, and the two rebuild the key. Key and passkey sign; the
 * Wallet API submits.
 */
export async function approve(prepared: Prepared) {
  const signer = prepared.signer.toLowerCase()
  const record = await shares<ShareRecord | undefined>('readonly', (s) => s.get(signer))
  if (!record) throw new Error('This browser has no Device Key for your wallet. Recover the wallet to use it here.')
  let output: BufferSource | undefined
  const assertion = await passkeySigner(record.credentialId, (o) => (output = o))(prepared.hash)

  let key = cached?.signer === signer ? cached.key : undefined
  if (!key) {
    const unlock = record.key ?? (output && (await aesKey(output)))
    if (!unlock) throw new Error('Face ID did not unlock your Device Key')
    const params = { name: 'AES-GCM', iv: record.iv, additionalData: aad(signer) }
    const shareA = bytesToHex(new Uint8Array(await crypto.subtle.decrypt(params, unlock, record.sealed)))
    key = rebuildKey(shareA, await releaseShareB(prepared, assertion), prepared.signer)
    forgetKey()
    cached = { signer, key, timer: setTimeout(forgetKey, KEY_TTL) }
  }
  await api('POST', `/api/wallet/operations/${prepared.hash}`, { signature: await signNormal(prepared, key, assertion) })
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

// ---------------------------------------------------------------- recovery

/** Registers the wallet with a new recovery key. Its Recovery Kit is the only copy: the user keeps it at home. */
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
    'Keep this at home, offline. It restores your wallet on a new phone.',
  ].join('\n')
  return { address, kit }
}

/** The recovery key in a pasted or uploaded Recovery Kit. */
export const kitKey = (text: string) => text.match(/0x[0-9a-fA-F]{64}/)?.[0] as Hex | undefined

/** On a new phone: the recovery key signs to find its wallet, and this browser gets the wallet's session. */
export async function checkKit(kit: Hex) {
  const at = Math.floor(Date.now() / 1000)
  const signature = await privateKeyToAccount(kit).signMessage({ message: kitProof(at) })
  await api('POST', '/api/recovery', { at, signature })
}

/**
 * Recovery on this browser: a new passkey and a new wallet key split 2-of-3, then an initiateRecovery
 * operation that the recovery key confirms and Swissquote (B) and the independent service (C) sign.
 */
export async function startRecovery(kit: Hex) {
  const device = await createDeviceKey()
  const signer = await keyCeremony(device, 'recovery')
  const prepared = await api<Prepared>('POST', '/api/wallet/operations', { recovery: { signer, passkey: device.passkey } })
  await api('POST', `/api/wallet/operations/${prepared.hash}`, { signature: await signRecovery(prepared, privateKeyToAccount(kit)) })
  const op = await settled(prepared.hash)
  if (op.status === 'failed') throw new Error(`The recovery was refused on-chain: ${op.reason}`)
}

/** The user cancels a pending recovery from the phone that holds the wallet: a normal operation, Face ID approves it. */
export async function cancelFromPhone(wallet: Address) {
  const data = encodeFunctionData({ abi: accountAbi, functionName: 'cancelRecovery' })
  const prepared = await api<Prepared>('POST', '/api/wallet/operations', { call: { to: wallet, data } })
  await approve(prepared)
  const op = await settled(prepared.hash)
  if (op.status === 'failed') throw new Error(`The cancel was refused on-chain: ${op.reason}`)
}
