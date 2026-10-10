// MOCKED: Swissquote sign-in, client records and KYC data. Demo fixtures only.
// Signing in is optional: a wallet created without it gets a session of its own, with no
// Swissquote account behind it (no KYC record, no PIN).
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

/** A Swissquote client, or just an `id` for the session of a wallet created without signing in. */
export type Client = { id: string; email?: string; password?: string; name?: string; kycFace?: string; pin?: string }

export const clients: Required<Client>[] = [
  { id: '123456', email: 'claire@example.com', password: 'claire', name: 'Claire Dubois', kycFace: 'claire', pin: '1234' },
  { id: '234567', email: 'anna@example.com', password: 'anna', name: 'Anna Muster', kycFace: 'anna', pin: '1234' },
]

export class HttpError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.body = body
  }
}

/** Wraps a route handler so thrown HttpErrors become JSON responses. */
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await handler(...args)
    } catch (error) {
      if (error instanceof HttpError) return Response.json({ error: error.message, ...error.body }, { status: error.status })
      console.error(error)
      return Response.json({ error: (error as Error).message }, { status: 500 })
    }
  }
}

const COOKIE = 'sq_session'
const secret = process.env.SESSION_SECRET ?? 'dev-only-session-secret'
const mac = (clientId: string) => createHmac('sha256', secret).update(clientId).digest('base64url')

const NO_ACCOUNT = 'wallet-'
// Chrome caps cookies at 400 days.
const WALLET_SESSION = 400 * 24 * 3600

/** False for a wallet created without signing in: no KYC record to recover with, no PIN to step up with. */
export const hasSwissquoteAccount = (clientId: string) => !clientId.startsWith(NO_ACCOUNT)

/** Binds this browser to the client. A wallet without an account has no other login, so its session outlives the browser's. */
export async function startSession(clientId: string) {
  ;(await cookies()).set(COOKIE, `${clientId}.${mac(clientId)}`, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: hasSwissquoteAccount(clientId) ? undefined : WALLET_SESSION,
  })
}

export async function signIn(email: string, password: string) {
  const client = clients.find((c) => c.email === email && c.password === password)
  if (!client) throw new HttpError(401, 'wrong email or password')
  await startSession(client.id)
  return client
}

async function sessionClient(): Promise<Client | undefined> {
  const [id, tag] = (await cookies()).get(COOKIE)?.value.split('.') ?? []
  const ok = id && tag && tag.length === mac(id).length && timingSafeEqual(Buffer.from(tag), Buffer.from(mac(id)))
  if (!ok) return undefined
  return hasSwissquoteAccount(id) ? clients.find((c) => c.id === id) : { id }
}

export async function requireClient(): Promise<Client> {
  const client = await sessionClient()
  if (!client) throw new HttpError(401, 'there is no wallet on this browser yet: create one, or recover yours')
  return client
}

/** The current session, or a new one for a wallet created without signing in to Swissquote. */
export async function clientOrNewWallet(): Promise<Client> {
  const client = await sessionClient()
  if (client) return client
  const id = `${NO_ACCOUNT}${randomUUID()}`
  await startSession(id)
  return { id }
}
