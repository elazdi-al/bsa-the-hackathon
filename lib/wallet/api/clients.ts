// Swissquote's clients: the session a wallet links with, the KYC record behind it, and the ID check matched against
// that record before a linked wallet's recovery or lock.
//
// MOCKED: the bank side. In the product the client signs in to their Swissquote account, already KYC'd, to link
// the wallet. Here a phone without a session signs in as a new, made-up client, and the ID check compares the typed
// document number where a real provider scans a document and a face.
import { randomInt } from "node:crypto";
import type { Address } from "viem";
import type * as z from "zod";
import type { identity } from "../schema.ts";
import { store, type Client } from "./db.ts";
import { HttpError } from "./http.ts";

const NAMES = ["Anna Muster", "Luca Bernasconi", "Sophie Favre", "Jonas Keller", "Elena Rossi", "Noah Meier", "Lea Graf", "Marco Steiner"];

/** A made-up client with a full KYC record. */
export function mockClient(): Client {
  return {
    number: String(randomInt(1_000_000, 10_000_000)),
    name: NAMES[randomInt(NAMES.length)],
    birthDate: new Date(Date.UTC(randomInt(1960, 2001), randomInt(12), randomInt(1, 29))).toISOString().slice(0, 10),
    // A Swiss ID card number: one letter, seven digits.
    document: `C${randomInt(1_000_000, 10_000_000)}`,
  };
}

/**
 * What the phone learns about the client it is signed in as: what the Swissquote app shows them anyway, their ID card
 * included, since a recovery asks for its number. The rest of the KYC record stays with Swissquote.
 */
const seen = ({ number, name, document }: Client) => ({ number, name, document });

/** The session's client, or a new made-up client and session when the phone has none Swissquote knows. */
export function signIn(session?: string) {
  const known = session ? store().clientBySession(session) : undefined;
  if (known) return { session: session!, client: seen(known) };
  let client = mockClient();
  // ponytail: seven random digits collide after a few thousand clients; a real bank assigns its numbers.
  while (!store().addClient(client)) client = mockClient();
  return sessionFor(client);
}

/** Signs a new phone in as `client`, who just passed their linked wallet's ID check. */
export const sessionFor = (client: Client) => ({ session: store().addSession(client.number), client: seen(client) });

const ownerOf = (wallet: Address) => {
  const owner = store().owner(wallet);
  return owner && store().client(owner.client);
};

// The number is seven digits, so whoever holds a wallet's Recovery Key, or just its address, must not get to guess
// it: five misses stop the wallet's ID checks for an hour. A hit clears them.
const MAX_MISSES = 5;
const LOCKOUT = 60 * 60 * 1000;

/**
 * The owner of `wallet` when the ID document matches their KYC record. MOCKED: the liveness check passes with the
 * document, where a real provider also matches the face in front of the phone to the one on the card.
 */
export function checkIdentity(wallet: Address, { document }: z.infer<typeof identity>): Client {
  const client = ownerOf(wallet);
  if (!client) throw new HttpError(403, "This wallet isn't linked to a Swissquote client, so there is no ID to check against.", { refused: "unlinked" });
  const missed = store().idMisses(wallet);
  const misses = missed && Date.now() < missed.until ? missed.misses : 0;
  if (misses >= MAX_MISSES) throw new HttpError(429, "Too many ID checks failed for this wallet. Try again in an hour.", { refused: "attempts" });
  if (document.trim().toUpperCase() !== client.document) {
    store().setIdMisses(wallet, misses + 1, Date.now() + LOCKOUT);
    throw new HttpError(403, "This ID doesn't match the one on file for the wallet's owner.", { refused: "identity" });
  }
  if (misses) store().setIdMisses(wallet, 0, 0);
  return client;
}
