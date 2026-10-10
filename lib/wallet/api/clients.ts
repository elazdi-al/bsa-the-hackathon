// Browser sessions. There is no sign-in: the first key ceremony starts a session for the new
// wallet, and on a new phone the recovery key finds the wallet and gives it the session.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

export type Client = { id: string }

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

// No other login, so the session outlives the browser's. Chrome caps cookies at 400 days.
const MAX_AGE = 400 * 24 * 3600

/** Binds this browser to the wallet. */
export async function startSession(clientId: string) {
  ;(await cookies()).set(COOKIE, `${clientId}.${mac(clientId)}`, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: MAX_AGE })
}

async function sessionClient(): Promise<Client | undefined> {
  const [id, tag] = (await cookies()).get(COOKIE)?.value.split('.') ?? []
  const ok = id && tag && tag.length === mac(id).length && timingSafeEqual(Buffer.from(tag), Buffer.from(mac(id)))
  return ok ? { id } : undefined
}

export async function requireClient(): Promise<Client> {
  const client = await sessionClient()
  if (!client) throw new HttpError(401, 'there is no wallet on this browser yet: create one, or recover yours')
  return client
}

/** The current session, or a new one for a new wallet. */
export async function clientOrNewWallet(): Promise<Client> {
  const client = await sessionClient()
  if (client) return client
  const id = `wallet-${randomUUID()}`
  await startSession(id)
  return { id }
}
