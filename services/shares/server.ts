// Shamir share service. Runs twice, as separate processes with separate databases:
//   ROLE=swissquote  Share B. Releases it to the phone for an operation the user's passkey approved,
//                    so the phone can rebuild the wallet key from Shares A + B.
//   ROLE=partner     Share C, the independent service. Releases it only for a recovery.
// Both release their share for a recovery only when the wallet's recovery key (kept at home) signed
// the initiateRecovery operation, so Swissquote and the independent service authorize it jointly.
// Shares are encrypted at rest (an HSM in production).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { WebAuthnP256 } from 'ox'
import { decodeFunctionData, isAddressEqual, recoverAddress, type Address, type Hex } from 'viem'
import { entryPoint07Abi, formatUserOperation, getUserOperationHash, type UserOperation } from 'viem/account-abstraction'
import { accountAbi, type PasskeyAssertion } from '../../lib/wallet/account.ts'
import { addresses, chain, entryPoint, publicClient } from '../../lib/wallet/env.ts'
import { holder, PARTNER, SWISSQUOTE, type Share } from '../../lib/wallet/shamir.ts'
import { verifyTicket, type Ticket } from '../../lib/wallet/tickets.ts'

const ROLE = process.env.ROLE
if (ROLE !== 'swissquote' && ROLE !== 'partner') throw new Error('ROLE must be swissquote or partner')
const ME = ROLE === 'swissquote' ? SWISSQUOTE : PARTNER
const PORT = Number(process.env.PORT ?? (ROLE === 'swissquote' ? 4001 : 4002))

const hex = process.env[`${ROLE.toUpperCase()}_SHARE_KEY`]
if (!hex || hex.length !== 64) throw new Error(`${ROLE.toUpperCase()}_SHARE_KEY must be 32 bytes of hex, see .env.example`)
const atRestKey = Buffer.from(hex, 'hex')

// ---------------------------------------------------------------- storage

mkdirSync('data', { recursive: true })
const db = new DatabaseSync(process.env.SHARES_DB ?? `data/${ROLE}.db`)
db.exec(`create table if not exists shares (
  signer text primary key, client_id text not null, passkey_x text not null, passkey_y text not null,
  share text not null, created_at integer not null)`)

type ShareRow = { signer: Address; client_id: string; passkey_x: Hex; passkey_y: Hex; share: string }
const getShare = (signer: string) =>
  db.prepare('select * from shares where signer = ? collate nocase').get(signer) as ShareRow | undefined

function seal(data: string, aad: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', atRestKey, iv).setAAD(Buffer.from(aad))
  const body = Buffer.concat([cipher.update(data), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
}

function open(sealed: string, aad: string): string {
  const raw = Buffer.from(sealed, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', atRestKey, raw.subarray(0, 12)).setAAD(Buffer.from(aad))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString()
}

// ---------------------------------------------------------------- endpoints

/** The phone hands over this service's share of a new wallet key, under Swissquote's ticket. */
async function deposit(signer: Address, body: { ticket: Ticket<'Ceremony'>; share: Share }) {
  const ticket = await verifyTicket(addresses.swissquote, chain.id, 'Ceremony', body.ticket)
  if (holder(body.share) !== ME) throw new Error(`this service holds share ${ME}`)
  if (getShare(signer)) throw new Error('this key already has a share here')
  db.prepare('insert into shares values (?, ?, ?, ?, ?, ?)').run(
    signer, ticket.clientId, ticket.passkeyX, ticket.passkeyY, seal(body.share, signer), Date.now(),
  )
  console.log(`[${ROLE}] share ${ME} stored: client ${ticket.clientId}, wallet key ${signer}`)
  return { stored: true }
}

type Release = { userOp: Record<string, unknown> } & (
  | { assertion: Omit<PasskeyAssertion, 'signature'> & { signature: { r: Hex; s: Hex } } }
  | { confirmationSignature: Hex }
)

/** Releases the share for one UserOperation, once its proof checks out. */
async function release(signer: Address, req: Release) {
  const share = getShare(signer)
  if (!share) throw new Error('unknown wallet key')
  const userOp = formatUserOperation(req.userOp as never) as UserOperation<'0.7'>
  const hash = getUserOperationHash({ chainId: chain.id, entryPointAddress: entryPoint, entryPointVersion: '0.7', userOperation: userOp })

  // Only the wallet's next operation: a proof already on-chain cannot be replayed for the share.
  const nonce = await publicClient.readContract({
    address: entryPoint,
    abi: entryPoint07Abi,
    functionName: 'getNonce',
    args: [userOp.sender, 0n],
  })
  if (userOp.nonce !== nonce) throw new Error("this is not the wallet's next operation")

  if ('assertion' in req) {
    if (ROLE !== 'swissquote') throw new Error('the independent service releases its share for recovery only')
    const ok = WebAuthnP256.verify({
      challenge: hash,
      metadata: { ...req.assertion.metadata, userVerificationRequired: true },
      signature: { r: BigInt(req.assertion.signature.r), s: BigInt(req.assertion.signature.s) },
      publicKey: { prefix: 4, x: BigInt(share.passkey_x), y: BigInt(share.passkey_y) },
    })
    if (!ok) throw new Error('the passkey did not approve this operation')
  } else if ('confirmationSignature' in req) {
    if (decodeFunctionData({ abi: accountAbi, data: userOp.callData }).functionName !== 'initiateRecovery') {
      throw new Error('the recovery key may only start a recovery')
    }
    const [walletKey, confirmationKey] = await Promise.all([
      publicClient.readContract({ address: userOp.sender, abi: accountAbi, functionName: 'signer' }),
      publicClient.readContract({ address: userOp.sender, abi: accountAbi, functionName: 'confirmationKey' }),
    ])
    if (!isAddressEqual(walletKey, share.signer)) throw new Error("this share is not the wallet's key")
    const confirmer = await recoverAddress({ hash, signature: req.confirmationSignature })
    if (!isAddressEqual(confirmer, confirmationKey)) throw new Error("the wallet's recovery key did not sign this recovery")
  } else {
    throw new Error('a passkey assertion or a recovery key signature is required')
  }

  console.log(`[${ROLE}] share ${ME} released for ${'assertion' in req ? 'an operation' : 'a recovery'} ${hash.slice(0, 10)}`)
  return { share: open(share.share, share.signer) }
}

// ---------------------------------------------------------------- http

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return JSON.parse(Buffer.concat(chunks).toString() || '{}')
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json',
    // The phone's browser calls the services directly: shares never pass through the Wallet API.
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
  })
  res.end(JSON.stringify(body))
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, null)
  const [, route, signer, action] = (req.url?.split('/') ?? []) as [string, string, Address, string]
  try {
    if (route !== 'shares' || !signer) return send(res, 404, { error: 'not found' })
    if (req.method === 'POST' && !action) return send(res, 200, await deposit(signer, await readJson(req)))
    if (req.method === 'POST' && action === 'release') return send(res, 200, await release(signer, await readJson(req)))
    if (req.method === 'GET' && !action) {
      const share = getShare(signer)
      return share
        ? send(res, 200, { signer: share.signer, clientId: share.client_id, passkey: { x: share.passkey_x, y: share.passkey_y } })
        : send(res, 404, { error: 'unknown wallet key' })
    }
    send(res, 404, { error: 'not found' })
  } catch (error) {
    console.warn(`[${ROLE}] refused ${req.method} ${req.url}: ${(error as Error).message}`)
    send(res, 400, { error: (error as Error).message })
  }
}).listen(PORT, () => console.log(`[${ROLE}] Shamir share ${ME} service on :${PORT}`))
