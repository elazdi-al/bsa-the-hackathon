"use client";

import Link from "next/link";
import { rowPress, sectionLabel } from "@/app/(tabs)/_components/list";
import { useActivity, useWallet } from "@/app/(tabs)/_components/wallet";
import { WalletIcon } from "@/components/icons";
import { recentSends, reviewHref, shortAddress } from "../data";

/** Where the wallet last sent, once its activity is read. */
export function RecentAddresses() {
  const snapshot = useWallet();
  const activity = useActivity();
  const recent =
    snapshot.status === "ready" ? activity && recentSends(activity, snapshot.wallet) : undefined;
  if (!recent?.length) return null;

  return (
    <section aria-labelledby="recent-title" className="mt-8 px-3">
      <h2 id="recent-title" className={`px-3 ${sectionLabel}`}>
        Recent
      </h2>
      <ul>
        {recent.map(({ address, note }) => (
          <li key={address}>
            <Link
              href={reviewHref(address)}
              transitionTypes={["push"]}
              className={`flex min-h-16 items-center gap-4 rounded-2xl px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-ring ${rowPress}`}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
                <WalletIcon />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-label">{shortAddress(address)}</span>
                <span className="truncate text-body text-muted-foreground">{note}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
