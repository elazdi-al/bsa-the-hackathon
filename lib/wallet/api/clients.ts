// MOCKED: Swissquote sign-in, client records and KYC data. Demo fixtures only.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

export type Client = { id: string; email: string; password: string; name: string; kycFace: string; pin: string }

export const clients: Client[] = [
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

export async function signIn(email: string, password: string): Promise<Client> {
  const client = clients.find((c) => c.email === email && c.password === password)
  if (!client) throw new HttpError(401, 'wrong email or password')
  ;(await cookies()).set(COOKIE, `${client.id}.${mac(client.id)}`, { httpOnly: true, sameSite: 'lax', path: '/' })
  return client
}

export async function requireClient(): Promise<Client> {
  const [id, tag] = (await cookies()).get(COOKIE)?.value.split('.') ?? []
  const ok = id && tag && tag.length === mac(id).length && timingSafeEqual(Buffer.from(tag), Buffer.from(mac(id)))
  const client = ok ? clients.find((c) => c.id === id) : undefined
  if (!client) throw new HttpError(401, 'sign in to Swissquote first')
  return client
}
