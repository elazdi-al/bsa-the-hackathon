import * as z from "zod";
import { signIn } from "@/lib/wallet/api/clients.ts";
import { parse, route } from "@/lib/wallet/api/http.ts";

/**
 * MOCKED: signing in to Swissquote, to link a wallet. A session Swissquote knows stays signed in as its client;
 * a phone without one signs in as a new, made-up client. Linking a wallet another client linked signs it in as them.
 */
export const POST = route(async (request: Request) => {
  const { session } = await parse(request, z.object({ session: z.string().optional() }));
  return Response.json(signIn(session));
});
