import { CardholderIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { RECENT_ADDRESSES } from "../data";

export function RecentAddresses() {
  return (
    <section aria-labelledby="recent-title" className="mt-4">
      <h2 id="recent-title" className="px-8 text-[16px] leading-5 font-medium tracking-[-0.06em]">
        Recent addresses
      </h2>
      <ul className="mt-1.5">
        {RECENT_ADDRESSES.map(({ label, note }) => (
          <li key={label}>
            <Link
              href="/send-hide-my-wallet"
              className="mx-4 flex items-center gap-3 rounded-[24px] px-[14px] py-1.5 transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-fuse-blue active:bg-black/[0.03]"
            >
              <span className="grid size-[42px] shrink-0 place-items-center rounded-full border border-black/[0.05]">
                <CardholderIcon weight="fill" size={20} />
              </span>
              <span className="flex flex-col">
                <span className="text-[16px] leading-5 font-medium">{label}</span>
                <span className="text-[13px] leading-[18px] tracking-[-0.06em] text-black/30">{note}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
