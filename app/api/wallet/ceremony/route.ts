import type { Passkey } from '@/lib/wallet/account.ts'
import { clientOrNewWallet, HttpError, requireClient, route } from '@/lib/wallet/api/clients.ts'
import { getWallet, swissquote } from '@/lib/wallet/api/operations.ts'
import { chain, services } from '@/lib/wallet/env.ts'
import { signTicket } from '@/lib/wallet/tickets.ts'

/**
 * Tickets the phone to hand a new wallet key's Shamir shares to Swissquote (B) and the independent
 * service (C), bound to this wallet and the passkey the phone just created. Creating a wallet
 * starts a session for it; a recovery uses the session the recovery key gave the new phone.
 */
export const POST = route(async (request: Request) => {
  const { passkey, purpose } = (await request.json()) as { passkey: Passkey; purpose: 'create' | 'recovery' }
  const client = purpose === 'create' ? await clientOrNewWallet() : await requireClient()
  const wallet = getWallet(client.id)

  if (purpose === 'create' && wallet) throw new HttpError(409, 'you already have a wallet, recover it instead')
  if (purpose === 'recovery' && !wallet) throw new HttpError(404, 'no wallet to recover')

  const ticket = await signTicket(swissquote(), chain.id, 'Ceremony', {
    clientId: client.id,
    passkeyX: passkey.x,
    passkeyY: passkey.y,
    expiry: Math.floor(Date.now() / 1000) + 300,
  })
  return Response.json({ ticket, services })
})
