import { UserOperationReceiptNotFoundError } from 'viem/account-abstraction'
import type { Hex } from 'viem'
import { HttpError, requireClient, route } from '@/lib/wallet/api/clients.ts'
import { bundler, loadOperation, submit } from '@/lib/wallet/api/operations.ts'

type Context = { params: Promise<{ hash: string }> }

/** Submits a prepared operation with the signature the phone assembled; the account verifies it. */
export const POST = route(async (request: Request, { params }: Context) => {
  const client = await requireClient()
  const hash = (await params).hash as Hex
  const userOp = loadOperation(client, hash)
  const { signature } = (await request.json()) as { signature?: Hex }
  if (!signature) throw new HttpError(400, 'signature required')
  await submit(userOp, signature)
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
