import { route, signIn } from '@/lib/wallet/api/clients.ts'

/** MOCKED Swissquote sign-in (email and password checked against demo fixtures). */
export const POST = route(async (request: Request) => {
  const { email, password } = await request.json()
  const client = await signIn(email, password)
  return Response.json({ clientId: client.id, name: client.name })
})
