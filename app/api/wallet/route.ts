import { erc20Abi, formatUnits, isAddress, type Address } from 'viem'
import { accountAbi, type Passkey } from '@/lib/wallet/account.ts'
import { HttpError, requireClient, route } from '@/lib/wallet/api/clients.ts'
import { audit, db, json } from '@/lib/wallet/api/db.ts'
import { getWallet, predictAddress, requireShare, requireWallet, walletConfig } from '@/lib/wallet/api/operations.ts'
import { addresses, publicClient } from '@/lib/wallet/env.ts'

export const GET = route(async () => {
  const client = await requireClient()
  const wallet = requireWallet(client.id)
  const deployed = !!(await publicClient.getCode({ address: wallet.address }))
  const pending = deployed
    ? await publicClient.readContract({ address: wallet.address, abi: accountAbi, functionName: 'pendingRecovery' })
    : undefined
  const usdc = await publicClient.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [wallet.address] })
  return Response.json({
    ...wallet,
    deployed,
    usdc: formatUnits(usdc, 6),
    pendingRecovery: pending?.[2] ? { signer: pending[0], executeAfter: pending[2] } : null,
  })
})

/** Registers the wallet after the key ceremony. Its address is fixed by the initial config (CREATE2). */
export const POST = route(async (request: Request) => {
  const client = await requireClient()
  const { signer, passkey, confirmationKey } = (await request.json()) as {
    signer: Address
    passkey: Passkey
    confirmationKey: Address
  }
  if (!isAddress(signer) || !isAddress(confirmationKey)) throw new HttpError(400, 'invalid address')
  if (getWallet(client.id)) throw new HttpError(409, 'you already have a wallet')
  await requireShare(client, signer, passkey)

  const config = walletConfig(signer, passkey, confirmationKey)
  const address = await predictAddress(config)
  db().prepare('insert into wallets values (?, ?, ?, ?)').run(client.id, address, signer, json(config))
  // Swissquote took part in the ceremony, so ownership is proven at creation (Travel Rule).
  audit(client.id, 'wallet.created', { address, signer })
  return Response.json({ address, config })
})
