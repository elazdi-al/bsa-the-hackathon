import { UserOperationReceiptNotFoundError } from 'viem/account-abstraction'
import type { Hex } from 'viem'
import { encodeRecoverySignature } from '@/lib/wallet/account.ts'
import { HttpError, requireClient, route } from '@/lib/wallet/api/clients.ts'
import { audit } from '@/lib/wallet/api/db.ts'
import { bundler, loadOperation, requireWallet, signRecovery, submit } from '@/lib/wallet/api/operations.ts'

type Context = { params: Promise<{ hash: string }> }

/**
 * Submits a prepared operation to the bundler.
 * Normal: `{ signature }`, the full account signature the phone assembled (MPC + passkey).
 * Recovery: `{ confirmationSignature }` from the client's home key; Swissquote and the
 * partner then add the MPC signature.
 */
export const POST = route(async (request: Request, { params }: Context) => {
  const client = await requireClient()
  const hash = (await params).hash as Hex
  const { kind, userOp } = loadOperation(client, hash)
  const body = (await request.json()) as { signature?: Hex; confirmationSignature?: Hex }

  let signature = body.signature
  if (kind === 'recovery') {
    if (!body.confirmationSignature) throw new HttpError(400, 'confirmationSignature required')
    const mpcSignature = await signRecovery(requireWallet(client.id), hash, userOp, body.confirmationSignature)
    signature = encodeRecoverySignature(mpcSignature, body.confirmationSignature)
  }
  if (!signature) throw new HttpError(400, 'signature required')

  await submit(userOp, signature)
  audit(client.id, kind === 'recovery' ? 'recovery.initiated' : 'operation.submitted', { hash })
  return Response.json({ hash })
})

export const GET = route(async (_request: Request, { params }: Context) => {
  const client = await requireClient()
  const hash = (await params).hash as Hex
  loadOperation(client, hash) // only the owner may poll
  try {
    const receipt = await bundler.getUserOperationReceipt({ hash })
    return Response.json({
      status: receipt.success ? 'completed' : 'failed',
      transactionHash: receipt.receipt.transactionHash,
      reason: receipt.reason ?? null,
    })
  } catch (error) {
    if (error instanceof UserOperationReceiptNotFoundError) return Response.json({ status: 'pending' })
    throw error
  }
})
