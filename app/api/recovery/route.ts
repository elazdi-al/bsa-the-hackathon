import { accountAbi } from '@/lib/wallet/account.ts'
import { HttpError, requireClient, route } from '@/lib/wallet/api/clients.ts'
import { audit, db } from '@/lib/wallet/api/db.ts'
import { operator, requireWallet } from '@/lib/wallet/api/operations.ts'
import { publicClient } from '@/lib/wallet/env.ts'

// Lost phone: identity check (POST), then a new key ceremony and a recovery operation
// (see /api/wallet/ceremony and /api/wallet/operations), then the on-chain delay.

/** MOCKED ID scan and liveness selfie, matched against the KYC record from account opening. */
export const POST = route(async (request: Request) => {
  const client = await requireClient()
  requireWallet(client.id)
  const { selfie } = (await request.json()) as { document?: string; selfie: string }
  if (selfie !== client.kycFace) {
    audit(client.id, 'recovery.identity_failed') // MOCKED alert to every channel of the real client
    throw new HttpError(403, 'Identity check failed. We blocked the recovery and alerted the account holder.')
  }
  db().prepare('insert or replace into identity_checks values (?, ?)').run(client.id, Date.now())
  audit(client.id, 'recovery.identity_passed')
  return Response.json({ verified: true })
})

export const GET = route(async () => {
  const client = await requireClient()
  const [signer, , executeAfter] = await publicClient.readContract({
    address: requireWallet(client.id).address,
    abi: accountAbi,
    functionName: 'pendingRecovery',
  })
  return Response.json(executeAfter ? { pending: true, signer, executeAfter } : { pending: false })
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
