import { toHex } from 'viem'
import type { Passkey } from '@/lib/wallet/account.ts'
import { HttpError, requireClient, route } from '@/lib/wallet/api/clients.ts'
import { getWallet, requireIdentityCheck, swissquote } from '@/lib/wallet/api/operations.ts'
import { chain, signerUrls } from '@/lib/wallet/env.ts'
import { signTicket } from '@/lib/wallet/tickets.ts'

/**
 * Tickets a 2-of-3 key ceremony between the phone (Share A), Swissquote (B) and the partner (C),
 * bound to the client and the passkey the phone just created. The phone then runs the ceremony
 * directly against both signers.
 */
export const POST = route(async (request: Request) => {
  const client = await requireClient()
  const { passkey, purpose } = (await request.json()) as { passkey: Passkey; purpose: 'create' | 'recovery' }
  const wallet = getWallet(client.id)

  if (purpose === 'create' && wallet) throw new HttpError(409, 'you already have a wallet, recover it instead')
  if (purpose === 'recovery') {
    if (!wallet) throw new HttpError(404, 'no wallet to recover')
    requireIdentityCheck(client)
  }

  const ticket = await signTicket(swissquote(), chain.id, 'Ceremony', {
    clientId: client.id,
    ceremonyId: toHex(crypto.getRandomValues(new Uint8Array(32))),
    passkeyX: passkey.x,
    passkeyY: passkey.y,
    expiry: Math.floor(Date.now() / 1000) + 300,
  })
  return Response.json({ ticket, signers: signerUrls })
})
