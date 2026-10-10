// Swissquote's clients: the app session the wallet runs in, the KYC record behind it, and the recovery
// ID check matched against that record.
//
// MOCKED: the bank side. In the product the wallet opens inside the Swissquote app, where the client is
// already signed in and KYC'd. Here a phone without a session signs in as a new, made-up client, and the
// ID check compares strings where a real provider scans a document and a face.
import { randomBytes, randomInt } from "node:crypto";
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
    face: `face-${randomBytes(8).toString("hex")}`,
  };
}

/** What the phone learns about the client it is signed in as. The KYC record stays with Swissquote. */
const seen = ({ number, name }: Client) => ({ number, name });

/** The session's client, or a new made-up client and session when the phone has none Swissquote knows. */
export function signIn(session?: string) {
  const known = session ? store().clientBySession(session) : undefined;
  if (known) return { session: session!, client: seen(known) };
  let client = mockClient();
  // ponytail: seven random digits collide after a few thousand clients; a real bank assigns its numbers.
  while (!store().addClient(client)) client = mockClient();
  return sessionFor(client);
}

/** Signs a new phone in as `client`, who just passed their wallet's ID check. */
export const sessionFor = (client: Client) => ({ session: store().addSession(client.number), client: seen(client) });

const ownerOf = (wallet: Address) => {
  const owner = store().owner(wallet);
  return owner && store().client(owner.client);
};

/**
 * The owner of `wallet` when the document and the face both match their KYC record. One refusal for either, so it
 * never tells a caller which half they got right.
 */
export function checkIdentity(wallet: Address, { document, selfie }: z.infer<typeof identity>): Client {
  const client = ownerOf(wallet);
  if (!client) throw new HttpError(403, "This wallet isn't linked to a Swissquote client, so there is no ID to check against.", { refused: "unlinked" });
  if (document.trim().toUpperCase() !== client.document || selfie !== client.face) {
    throw new HttpError(403, "This ID doesn't match the one on file for the wallet's owner.", { refused: "identity" });
  }
  return client;
}

/**
 * MOCKED: the owner's own ID and face, which a real check scans from the person in front of the phone. The demo
 * hands them to the Recovery Key's holder so the owner's recovery stays one tap, which makes this mock check only
 * as strong as the key. A real Swissquote never sends a KYC record to a phone.
 */
export function idOnFile(wallet: Address) {
  const client = ownerOf(wallet);
  return client ? { name: client.name, document: client.document, selfie: client.face } : null;
}
