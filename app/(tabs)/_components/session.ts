"use client";

import { useSyncExternalStore } from "react";
import { SESSION as KEY, type SignedIn } from "@/lib/wallet/phone";

// The Swissquote session this phone linked the wallet with, or that a linked wallet's recovery signed it in with. A
// wallet nobody linked has none. It outlives the wallet: removing the wallet from this phone doesn't sign the client
// out. MOCKED: each phone signs in as its own made-up client.
const listeners = new Set<() => void>();
let raw: string | null | undefined;
let parsed: SignedIn | undefined;

/** The session this phone keeps, if any. Parsed once per change, so React sees a stable value. */
export function storedSession(): SignedIn | undefined {
  const now = localStorage.getItem(KEY);
  if (now !== raw) {
    raw = now;
    try {
      parsed = JSON.parse(now ?? "null") ?? undefined;
    } catch {
      parsed = undefined;
    }
  }
  return parsed;
}

export function keepSession(next: SignedIn) {
  localStorage.setItem(KEY, JSON.stringify(next));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The client this phone is signed in to Swissquote as, if it linked or recovered a linked wallet. */
export const useSignedIn = () => useSyncExternalStore(subscribe, storedSession, () => undefined);
