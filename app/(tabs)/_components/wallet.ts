"use client";

import { useEffect, useState } from "react";
import { formatUnits, isAddressEqual, type Address } from "viem";
import { phone } from "@/lib/wallet/phone";

/** `recovering`: someone started a recovery of this wallet while this phone still controls it, so it can cancel. */
export type Wallet = { address: Address; usdc: number; recovering: boolean };

/** This phone's wallet, refetched whenever `key` changes. Undefined until loaded, or with no wallet on this phone. */
export function useWallet(key?: unknown) {
  const [wallet, setWallet] = useState<Wallet>();
  useEffect(() => {
    if (!phone.hasWallet()) return;
    let live = true;
    phone.state().then(
      (s) => {
        const signer = phone.device()?.signer;
        const controls = !!signer && isAddressEqual(signer, s.signer);
        if (live) setWallet({ address: s.address, usdc: Number(formatUnits(BigInt(s.usdc), 6)), recovering: !!s.pendingRecovery && controls });
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [key]);
  return wallet;
}
