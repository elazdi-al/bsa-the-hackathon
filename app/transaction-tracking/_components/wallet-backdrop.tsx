"use client";

import { RowBody } from "@/app/(tabs)/history/_components/tx-row";
import { useLiveTxs } from "@/app/(tabs)/history/live";

/** A blurred impression of History behind the sheet: the wallet's own transfers, a screenful, or nothing before they're read. */
export function WalletBackdrop() {
  const { txs } = useLiveTxs();
  return (
    <div aria-hidden className="absolute inset-0 bg-white">
      <ul className="mx-auto max-w-md scale-110 px-5 pt-[calc(env(safe-area-inset-top)_+_28px)] blur-[14px]">
        {txs.slice(0, 12).map((tx) => (
          <li key={tx.id} className="flex items-center gap-4 py-3">
            <RowBody tx={tx} />
          </li>
        ))}
      </ul>
    </div>
  );
}
