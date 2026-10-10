// MPC co-signer. Runs twice, as separate processes with separate databases:
//   ROLE=swissquote  Share B. Co-signs normal operations the client approved with their
//                    passkey and Swissquote's policy approved (paymaster signature).
//   ROLE=partner     Share C, the independent third party. Co-signs recovery only, and only
//                    with Swissquote's approval AND the client's confirmation-key signature.
// Both take part in key ceremonies. Shares are encrypted at rest (an HSM in production).
import * as dkls from '@silencelaboratories/dkls-wasm-ll-node'
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { WebAuthnP256 } from 'ox'
import {
  decodeAbiParameters,
  decodeFunctionData,
  isAddressEqual,
  recoverAddress,
  recoverMessageAddress,
  slice,
  type Address,
  type Hex,
} from 'viem'
import { formatUserOperation, getUserOperationHash, toPackedUserOperation, type UserOperation } from 'viem/account-abstraction'
import { accountAbi, paymasterAbi, type PasskeyAssertion } from '../../lib/wallet/account.ts'
import { addresses, chain, entryPoint, publicClient } from '../../lib/wallet/env.ts'
import { keygenParty, PARTNER, signerAddress, signParty, SWISSQUOTE, type Party, type Wire } from '../../lib/wallet/mpc.ts'
import { verifyTicket, type Ticket } from '../../lib/wallet/tickets.ts'

const ROLE = process.env.ROLE
if (ROLE !== 'swissquote' && ROLE !== 'partner') throw new Error('ROLE must be swissquote or partner')
const ME = ROLE === 'swissquote' ? SWISSQUOTE : PARTNER
const PEER = ROLE === 'swissquote' ? PARTNER : SWISSQUOTE
const PORT = Number(process.env.PORT ?? (ROLE === 'swissquote' ? 4001 : 4002))

const key = (name: string) => {
  const hex = process.env[name]
  if (!hex || hex.length !== 64) throw new Error(`${name} must be 32 bytes of hex, see .env.example`)
  return Buffer.from(hex, 'hex')
}
const atRestKey = key(`${ROLE.toUpperCase()}_SHARE_KEY`)
// ponytail: pre-shared key between Swissquote and partner; production uses mTLS between them.
const peerKey = key('SIGNER_PEER_KEY')

// ---------------------------------------------------------------- storage

mkdirSync('data', { recursive: true })
const db = new DatabaseSync(process.env.SIGNER_DB ?? `data/${ROLE}.db`)
db.exec(`create table if not exists shares (
  signer text primary key, client_id text not null, passkey_x text not null, passkey_y text not null,
  share text not null, created_at integer not null)`)

type ShareRow = { signer: Address; client_id: string; passkey_x: Hex; passkey_y: Hex; share: string }
const getShare = (signer: string) =>
  db.prepare('select * from shares where signer = ? collate nocase').get(signer) as ShareRow | undefined

function seal(k: Buffer, data: Uint8Array, aad: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', k, iv).setAAD(Buffer.from(aad))
  const body = Buffer.concat([cipher.update(data), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
}

function open(k: Buffer, sealed: string, aad: string): Uint8Array {
  const raw = Buffer.from(sealed, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', k, raw.subarray(0, 12)).setAAD(Buffer.from(aad))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()])
}

// The phone relays Swissquote <-> partner keygen messages, so it must not read them.
const peerChannel = (session: string) => Buffer.from(hkdfSync('sha256', peerKey, session, 'sq-mpc-peer', 32))
const fromPeer = (session: string, inbox: Wire[]) =>
  inbox.map((m) =>
    m.from === PEER && m.to === ME
      ? { ...m, payload: Buffer.from(open(peerChannel(session), m.payload, `${PEER}>${ME}`)).toString('base64') }
      : m,
  )
const toPeer = (session: string, outbox: Wire[]) =>
  outbox.map((m) =>
    m.to === PEER ? { ...m, payload: seal(peerChannel(session), Buffer.from(m.payload, 'base64'), `${ME}>${PEER}`) } : m,
  )

// ---------------------------------------------------------------- authorization

type SignRequest =
  | { kind: 'normal'; signer: Address; userOp: Record<string, unknown>; assertion: PasskeyAssertion }
  | {
      kind: 'recovery'
      signer: Address
      userOp: Record<string, unknown>
      confirmationSignature: Hex
      approval: Ticket<'RecoveryApproval'>
    }

/** Checks a signing request against this share holder's rules; returns the hash to sign. */
async function authorize(req: SignRequest, share: ShareRow): Promise<Hex> {
  const userOp = formatUserOperation(req.userOp as never) as UserOperation<'0.7'>
  const hash = getUserOperationHash({ chainId: chain.id, entryPointAddress: entryPoint, entryPointVersion: '0.7', userOperation: userOp })

  if (req.kind === 'normal') {
    if (ROLE !== 'swissquote') throw new Error('the partner only co-signs recoveries')
    await requireSponsorship(userOp)
    const ok = WebAuthnP256.verify({
      challenge: hash,
      metadata: { ...req.assertion.metadata, userVerificationRequired: true },
      signature: { r: BigInt(req.assertion.signature.r), s: BigInt(req.assertion.signature.s) },
      publicKey: { prefix: 4, x: BigInt(share.passkey_x), y: BigInt(share.passkey_y) },
    })
    if (!ok) throw new Error('passkey assertion does not approve this operation')
    return hash
  }

  if (req.kind === 'recovery') {
    if (decodeFunctionData({ abi: accountAbi, data: userOp.callData }).functionName !== 'initiateRecovery') {
      throw new Error('recovery keys may only start a recovery')
    }
    const approval = await verifyTicket(addresses.swissquote, chain.id, 'RecoveryApproval', req.approval)
    if (approval.userOpHash !== hash || !isAddressEqual(approval.wallet, userOp.sender)) {
      throw new Error('approval is for another operation')
    }
    const [onchainSigner, confirmationKey] = await Promise.all([
      publicClient.readContract({ address: userOp.sender, abi: accountAbi, functionName: 'signer' }),
      publicClient.readContract({ address: userOp.sender, abi: accountAbi, functionName: 'confirmationKey' }),
    ])
    if (!isAddressEqual(onchainSigner, share.signer)) throw new Error('share is not the wallet key')
    // Independent check: the client's confirmation key, kept at home, must have signed too.
    const confirmer = await recoverAddress({ hash, signature: req.confirmationSignature })
    if (!isAddressEqual(confirmer, confirmationKey)) throw new Error('confirmation key signature missing')
    return hash
  }

  throw new Error('unknown request kind')
}

/** A valid, unexpired paymaster signature means Swissquote's policy approved this exact operation. */
async function requireSponsorship(userOp: UserOperation<'0.7'>) {
  if (!userOp.paymaster || !isAddressEqual(userOp.paymaster, addresses.paymaster)) throw new Error('not sponsored by Swissquote')
  const [validUntil, validAfter] = decodeAbiParameters([{ type: 'uint48' }, { type: 'uint48' }], slice(userOp.paymasterData!, 0, 64))
  const [sponsored, block] = await Promise.all([
    publicClient.readContract({
      address: addresses.paymaster,
      abi: paymasterAbi,
      functionName: 'getHash',
      args: [toPackedUserOperation(userOp), validUntil, validAfter],
    }),
    publicClient.getBlock(),
  ])
  if (validUntil < block.timestamp) throw new Error('policy decision expired')
  const approver = await recoverMessageAddress({ message: { raw: sponsored }, signature: slice(userOp.paymasterData!, 64) })
  if (!isAddressEqual(approver, addresses.swissquote)) throw new Error('not approved by Swissquote policy')
}

// ---------------------------------------------------------------- protocol sessions

// ponytail: in-memory sessions; an abandoned ceremony stays until restart.
const sessions = new Map<string, Party & { finish?: (publicKey: Hex) => void }>()

async function keygen(id: string, body: { ticket: Ticket<'Ceremony'>; step: number; inbox: Wire[]; commitments: string[] }) {
  if (body.step === 0) {
    const ticket = await verifyTicket(addresses.swissquote, chain.id, 'Ceremony', body.ticket)
    if (ticket.ceremonyId !== id) throw new Error('ticket is for another ceremony')
    const party = keygenParty(dkls, ME)
    sessions.set(`keygen:${id}`, {
      ...party,
      finish(publicKey) {
        const signer = signerAddress(publicKey)
        db.prepare('insert into shares values (?, ?, ?, ?, ?, ?)').run(
          signer, ticket.clientId, ticket.passkeyX, ticket.passkeyY,
          seal(atRestKey, party.keyshare()!, signer), Date.now(),
        )
        console.log(`[${ROLE}] key ceremony ${id.slice(0, 10)} done: client ${ticket.clientId}, signer ${signer}`)
      },
    })
  }
  return step(`keygen:${id}`, body)
}

async function sign(id: string, body: { request: SignRequest; step: number; inbox: Wire[]; commitments: string[] }) {
  if (body.step === 0) {
    const share = getShare(body.request.signer)
    if (!share) throw new Error('unknown wallet key')
    const hash = await authorize(body.request, share)
    sessions.set(`sign:${id}`, signParty(dkls, open(atRestKey, share.share, share.signer), hash))
    console.log(`[${ROLE}] co-signing ${body.request.kind} operation ${hash.slice(0, 10)} for client ${share.client_id}`)
  }
  return step(`sign:${id}`, body)
}

async function step(sessionId: string, body: { step: number; inbox: Wire[]; commitments: string[] }) {
  const party = sessions.get(sessionId)
  if (!party) throw new Error('no such session')
  try {
    const result = await party.step(body.step, fromPeer(sessionId, body.inbox), body.commitments ?? [])
    if (result.publicKey) party.finish?.(result.publicKey)
    if (result.publicKey || result.signature) sessions.delete(sessionId)
    return { ...result, messages: toPeer(sessionId, result.messages) }
  } catch (error) {
    sessions.delete(sessionId) // a failed MPC session cannot be resumed
    throw error
  }
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
    // The phone's browser calls the signers directly during the key ceremony and signing.
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
  })
  res.end(JSON.stringify(body))
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, null)
  const [, route, id] = req.url?.split('/') ?? []
  try {
    if (req.method === 'POST' && route === 'keygen' && id) return send(res, 200, await keygen(id, await readJson(req)))
    if (req.method === 'POST' && route === 'sign' && id) return send(res, 200, await sign(id, await readJson(req)))
    if (req.method === 'GET' && route === 'shares' && id) {
      const share = getShare(id)
      return share
        ? send(res, 200, { signer: share.signer, clientId: share.client_id, passkey: { x: share.passkey_x, y: share.passkey_y } })
        : send(res, 404, { error: 'unknown wallet key' })
    }
    send(res, 404, { error: 'not found' })
  } catch (error) {
    console.warn(`[${ROLE}] refused ${req.url}: ${(error as Error).message}`)
    send(res, 400, { error: (error as Error).message })
  }
}).listen(PORT, () => console.log(`[${ROLE}] signer for share ${ME} on :${PORT}`))
