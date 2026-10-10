import { recoverMessageAddress, type Hex } from 'viem'
import { accountAbi, kitProof } from '@/lib/wallet/account.ts'
import { hasSwissquoteAccount, HttpError, requireClient, route, startSession } from '@/lib/wallet/api/clients.ts'
import { audit, db } from '@/lib/wallet/api/db.ts'
import { operator, requireWallet } from '@/lib/wallet/api/operations.ts'
import { publicClient } from '@/lib/wallet/env.ts'

// Lost phone: identity check (POST), then a new key ceremony and a recovery operation
// (see /api/wallet/ceremony and /api/wallet/operations), then the on-chain delay.

const KIT_PROOF_TTL = 300

type IdCheck = { document?: string; selfie: string } | { at: number; signature: Hex }

/**
 * Identity check. Swissquote clients: the MOCKED ID scan and liveness selfie, matched against the KYC
 * record from account opening. A wallet without an account has no KYC record, so its Recovery Kit
 * signs instead, and this browser joins the wallet's session. The on-chain delay still lets the old
 * phone cancel.
 */
export const POST = route(async (request: Request) => {
  const body = (await request.json()) as IdCheck
  if ('signature' in body) return Response.json(await checkKit(body.at, body.signature))

  const client = await requireClient()
  requireWallet(client.id)
  if (!hasSwissquoteAccount(client.id)) throw new HttpError(400, 'without a Swissquote account, recover with your Recovery Kit')
  if (body.selfie !== client.kycFace) {
    audit(client.id, 'recovery.identity_failed') // MOCKED alert to every channel of the real client
    throw new HttpError(403, 'Identity check failed. We blocked the recovery and alerted the account holder.')
  }
  db().prepare('insert or replace into identity_checks values (?, ?)').run(client.id, Date.now())
  audit(client.id, 'recovery.identity_passed')
  return Response.json({ verified: true })
})

async function checkKit(at: number, signature: Hex) {
  if (!(Math.abs(Date.now() / 1000 - at) < KIT_PROOF_TTL)) throw new HttpError(400, 'that request expired, try again')
  const confirmationKey = await recoverMessageAddress({ message: kitProof(at), signature })
  const wallet = db()
    .prepare("select client_id from wallets where lower(json_extract(config, '$.confirmationKey')) = lower(?)")
    .get(confirmationKey) as { client_id: string } | undefined
  if (!wallet) {
    audit(null, 'recovery.kit_failed', { confirmationKey })
    throw new HttpError(403, "This Recovery Kit doesn't belong to any wallet.")
  }
  if (hasSwissquoteAccount(wallet.client_id)) {
    throw new HttpError(403, 'This wallet belongs to a Swissquote account. Sign in to Swissquote to recover it.', { signIn: true })
  }
  await startSession(wallet.client_id)
  db().prepare('insert or replace into identity_checks values (?, ?)').run(wallet.client_id, Date.now())
  audit(wallet.client_id, 'recovery.kit_passed')
  return { verified: true }
}

export const GET = route(async () => {
  const client = await requireClient()
  const [signer, , executeAfter] = await publicClient.readContract({
    address: requireWallet(client.id).address,
    abi: accountAbi,
    functionName: 'pendingRecovery',
  })
  // `idCheck`: a KYC record to check first. Without a Swissquote account the Recovery Kit is the proof.
  const idCheck = hasSwissquoteAccount(client.id)
  return Response.json(executeAfter ? { pending: true, signer, executeAfter, idCheck } : { pending: false, idCheck })
})

/** Swissquote cancels the pending recovery for the client (e-banking, hotline), as the wallet's guardian. */
export const DELETE = route(async () => {
  const client = await requireClient()
  const wallet = requireWallet(client.id)
  const tx = await operator().writeContract({ address: wallet.address, abi: accountAbi, functionName: 'cancelRecovery' })
  await publicClient.waitForTransactionReceipt({ hash: tx })
  db().prepare('delete from identity_checks where client_id = ?').run(client.id)
  audit(client.id, 'recovery.cancelled', { tx })
  return Response.json({ transactionHash: tx })
})

/** After the delay, Swissquote pays to finalize. Anyone could; the client needs no ETH. */
export const PATCH = route(async () => {
  const client = await requireClient()
  const wallet = requireWallet(client.id)
  const tx = await operator()
    .writeContract({ address: wallet.address, abi: accountAbi, functionName: 'finalizeRecovery' })
    .catch((error: Error) => {
      throw new HttpError(409, 'recovery is not ready', { detail: error.message.split('\n')[0] })
    })
  await publicClient.waitForTransactionReceipt({ hash: tx })
  const signer = await publicClient.readContract({ address: wallet.address, abi: accountAbi, functionName: 'signer' })
  db().prepare('update wallets set signer = ? where client_id = ?').run(signer, client.id)
  audit(client.id, 'recovery.finalized', { tx, signer })
  return Response.json({ transactionHash: tx, signer })
})
