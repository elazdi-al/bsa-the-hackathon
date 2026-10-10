import { encodeFunctionData, type Address, type Hex } from 'viem'
import { accountAbi, stubRecoverySignature, stubSignature, type Passkey } from '@/lib/wallet/account.ts'
import { HttpError, requireClient, route } from '@/lib/wallet/api/clients.ts'
import { ensureDeployed, prepare, requireShare, requireWallet } from '@/lib/wallet/api/operations.ts'

type Body = { call: { to: Address; value?: string; data?: Hex } } | { recovery: { signer: Address; passkey: Passkey } }

/**
 * Prepares a sponsored UserOperation and returns its hash for the phone to sign.
 * `call`: a normal operation, signed by the wallet key (Shares A + B, or the phone's cached key) and the passkey.
 * `recovery`: initiateRecovery to the new key and passkey of a new phone, signed by the wallet key
 * (Shares B + C) and the recovery key from home.
 */
export const POST = route(async (request: Request) => {
  const client = await requireClient()
  const wallet = requireWallet(client.id)
  const body = (await request.json()) as Body

  if ('recovery' in body) {
    const { signer, passkey } = body.recovery
    await requireShare(client, signer, passkey) // the new key, split on the new phone
    await ensureDeployed(wallet)
    const callData = encodeFunctionData({ abi: accountAbi, functionName: 'initiateRecovery', args: [signer, passkey] })
    return Response.json(await prepare(client, wallet, callData, stubRecoverySignature))
  }

  const { to, value, data } = body.call ?? {}
  if (!to) throw new HttpError(400, 'call.to required')
  const callData = encodeFunctionData({ abi: accountAbi, functionName: 'execute', args: [to, BigInt(value ?? 0), data ?? '0x'] })
  return Response.json(await prepare(client, wallet, callData, stubSignature))
})
