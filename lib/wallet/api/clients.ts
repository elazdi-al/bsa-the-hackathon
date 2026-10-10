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
  const client = mockClient();
  store().addClient(client);
  return sessionFor(client);
}

/** Signs a new phone in as `client`, who just passed their wallet's ID check. */
export const sessionFor = (client: Client) => ({ session: store().addSession(client.number), client: seen(client) });

const ownerOf = (wallet: Address) => {
  const owner = store().owner(wallet);
  return owner && store().client(owner.client);
};

/** The owner of `wallet` when the document and the face match their KYC record; a refusal that says which didn't, otherwise. */
export function checkIdentity(wallet: Address, { document, selfie }: z.infer<typeof identity>): Client {
  const refuse = (message: string) => new HttpError(403, message, { refused: "identity" });
  const client = ownerOf(wallet);
  if (!client) throw refuse("This wallet isn't linked to a Swissquote client, so there is no ID to check against.");
  if (document.trim().toUpperCase() !== client.document) throw refuse("This ID document isn't the one on file for the wallet's owner.");
  if (selfie !== client.face) throw refuse("The selfie doesn't match the face on file for the wallet's owner.");
  return client;
}

/**
 * MOCKED: the owner's own ID and face, which a real check would scan from the person in front of the phone.
 * Only the Recovery Key's holder gets them, so a demo recovery stays one tap; Swissquote never hands these out.
 */
export function idOnFile(wallet: Address) {
  const client = ownerOf(wallet);
  return client ? { name: client.name, document: client.document, selfie: client.face } : null;
}
