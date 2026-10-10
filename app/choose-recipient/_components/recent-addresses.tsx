import Link from "next/link";
import { rowPress, sectionLabel } from "@/app/(tabs)/_components/list";
import { WalletIcon } from "@/components/icons";
import { RECENT_ADDRESSES, reviewHref, shortAddress } from "../data";

export function RecentAddresses() {
  return (
    <section aria-labelledby="recent-title" className="mt-8 px-3">
      <h2 id="recent-title" className={`px-3 ${sectionLabel}`}>
        Recent
      </h2>
      <ul>
        {RECENT_ADDRESSES.map(({ address, note }) => (
          <li key={address}>
            <Link
              href={reviewHref(address)}
              transitionTypes={["push"]}
              className={`flex min-h-16 items-center gap-4 rounded-2xl px-3 py-2.5 focus-visible:outline-2 focus-visible:outline-fuse-blue ${rowPress}`}
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
