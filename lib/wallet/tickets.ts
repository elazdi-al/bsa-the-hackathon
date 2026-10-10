// EIP-712 tickets Swissquote's Wallet API signs for the share services. They let the
// independent service verify Swissquote's decisions with a public address, without a shared secret.
import { verifyTypedData, type Address, type Hex, type LocalAccount } from 'viem'

const domain = (chainId: number) => ({ name: 'Swissquote Wallet', version: '1', chainId })

const types = {
  /** This wallet's phone may hand its new key's shares to the services, bound to this passkey. */
  Ceremony: [
    { name: 'clientId', type: 'string' },
    { name: 'passkeyX', type: 'bytes32' },
    { name: 'passkeyY', type: 'bytes32' },
    { name: 'expiry', type: 'uint64' },
  ],
} as const

export type Ceremony = { clientId: string; passkeyX: Hex; passkeyY: Hex; expiry: number }
type Messages = { Ceremony: Ceremony }
export type Ticket<K extends keyof Messages> = { message: Messages[K]; signature: Hex }

export async function signTicket<K extends keyof Messages>(
  account: LocalAccount,
  chainId: number,
  kind: K,
  message: Messages[K],
): Promise<Ticket<K>> {
  const signature = await account.signTypedData({ domain: domain(chainId), types, primaryType: kind, message } as never)
  return { message, signature }
}

/** Throws unless `swissquote` signed the ticket and it has not expired. */
export async function verifyTicket<K extends keyof Messages>(
  swissquote: Address,
  chainId: number,
  kind: K,
  ticket: Ticket<K>,
): Promise<Messages[K]> {
  const ok = await verifyTypedData({
    address: swissquote,
    domain: domain(chainId),
    types,
    primaryType: kind,
    message: ticket.message,
    signature: ticket.signature,
  } as never)
  if (!ok || ticket.message.expiry < Date.now() / 1000) throw new Error(`invalid or expired ${kind} ticket`)
  return ticket.message
}
