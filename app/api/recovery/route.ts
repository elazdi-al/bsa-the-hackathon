import { recoverMessageAddress, type Hex } from 'viem'
import { accountAbi, kitProof } from '@/lib/wallet/account.ts'
import { HttpError, requireClient, route, startSession } from '@/lib/wallet/api/clients.ts'
import { db } from '@/lib/wallet/api/db.ts'
import { operator, requireWallet } from '@/lib/wallet/api/operations.ts'
import { publicClient } from '@/lib/wallet/env.ts'

// Lost phone: the recovery key finds the wallet (POST), the new phone splits a new key (see
// /api/wallet/ceremony) and starts a recovery that Shares B + C and the recovery key sign (see
// /api/wallet/operations), then the 48-hour on-chain delay.

const KIT_PROOF_TTL = 300

/** The new phone has no session: the recovery key signs to find its wallet, and this browser gets the wallet's session. */
export const POST = route(async (request: Request) => {
  const { at, signature } = (await request.json()) as { at: number; signature: Hex }
  if (!(Math.abs(Date.now() / 1000 - at) < KIT_PROOF_TTL)) throw new HttpError(400, 'that request expired, try again')
  const confirmationKey = await recoverMessageAddress({ message: kitProof(at), signature })
  const wallet = db()
    .prepare("select client_id from wallets where lower(json_extract(config, '$.confirmationKey')) = lower(?)")
    .get(confirmationKey) as { client_id: string } | undefined
  if (!wallet) throw new HttpError(403, "This Recovery Kit doesn't belong to any wallet.")
  await startSession(wallet.client_id)
  return Response.json({ found: true })
})

export const GET = route(async () => {
  const client = await requireClient()
  const { address } = requireWallet(client.id)
  const deployed = !!(await publicClient.getCode({ address }))
  const [signer, , executeAfter] = deployed
    ? await publicClient.readContract({ address, abi: accountAbi, functionName: 'pendingRecovery' })
    : []
  return Response.json(executeAfter ? { pending: true, signer, executeAfter } : { pending: false })
})

/** Swissquote cancels the pending recovery for the user (e-banking, hotline), as the wallet's guardian. */
export const DELETE = route(async () => {
  const client = await requireClient()
  const wallet = requireWallet(client.id)
  const tx = await operator().writeContract({ address: wallet.address, abi: accountAbi, functionName: 'cancelRecovery' })
  await publicClient.waitForTransactionReceipt({ hash: tx })
  return Response.json({ transactionHash: tx })
})

/** After the delay, Swissquote pays to finalize. Anyone could; the user needs no ETH. */
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
  return Response.json({ transactionHash: tx, signer })
})
