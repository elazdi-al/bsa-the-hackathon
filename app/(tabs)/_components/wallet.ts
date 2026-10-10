"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { api } from "@/lib/wallet/browser";

/** `recovering`: someone started a recovery of this wallet; this phone can cancel it. */
export type Wallet = { address: Address; usdc: number; recovering: boolean };

/** The client's wallet from the Wallet API, refetched whenever `key` changes. Undefined until loaded, or with no wallet on this browser. */
export function useWallet(key?: unknown) {
  const [wallet, setWallet] = useState<Wallet>();
  useEffect(() => {
    let live = true;
    api<{ address: Address; usdc: string; pendingRecovery: unknown }>("GET", "/api/wallet").then(
      (w) => live && setWallet({ address: w.address, usdc: Number(w.usdc), recovering: !!w.pendingRecovery }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [key]);
  return wallet;
}
