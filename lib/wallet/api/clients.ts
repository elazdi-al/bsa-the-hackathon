// Swissquote's clients: the session a wallet links with, and the client behind it.
//
// MOCKED: the bank side. In the product the client signs in to their own Swissquote account to link the wallet.
// Here a phone without a session signs in as a new, made-up client.
import { randomInt } from "node:crypto";
import { store, type Client } from "./db.ts";

/** A made-up client. */
const mockClient = (): Client => ({ number: String(randomInt(1_000_000, 10_000_000)) });

/** What the phone learns about the client it is signed in as: their client number. */
const seen = ({ number }: Client) => ({ number });

/** The session's client, or a new made-up client and session when the phone has none Swissquote knows. */
export function signIn(session?: string) {
  const known = session ? store().clientBySession(session) : undefined;
  if (known) return { session: session!, client: seen(known) };
  let client = mockClient();
  // ponytail: seven random digits collide after a few thousand clients; a real bank assigns its numbers.
  while (!store().addClient(client)) client = mockClient();
  return sessionFor(client);
}

/** Signs a phone in as `client`. */
export const sessionFor = (client: Client) => ({ session: store().addSession(client.number), client: seen(client) });
