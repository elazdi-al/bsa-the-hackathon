"use client";

import { useEffect, useState } from "react";
import { phone, type SignedIn } from "@/lib/wallet/phone";

// The Swissquote app's session, which the wallet runs inside. It outlives the wallet: removing the wallet
// from this phone doesn't sign the client out. MOCKED: each phone signs in as its own made-up client.
const KEY = "swissquote.session";
let signing: Promise<SignedIn> | undefined;

/** Keeps a session on this phone, as the one a recovery's ID check signed it in with. */
export function keepSession(next: SignedIn) {
  localStorage.setItem(KEY, JSON.stringify(next));
  signing = Promise.resolve(next);
  return next;
}

/** The client this phone is signed in to Swissquote as. Signs in first if it isn't, or if Swissquote forgot its session. */
export function signedIn(): Promise<SignedIn> {
  signing ??= phone.signIn(stored()?.session).then(keepSession, (error: unknown) => {
    signing = undefined;
    throw error;
  });
  return signing;
}

function stored(): SignedIn | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

/** The signed-in client, once known. */
export function useSignedIn(): SignedIn | undefined {
  const [value, setValue] = useState<SignedIn>();
  useEffect(() => {
    signedIn().then(setValue, () => {});
  }, []);
  return value;
}
