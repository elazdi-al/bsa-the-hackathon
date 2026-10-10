import { CardholderIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { RECENT_ADDRESSES, reviewHref, shortAddress } from "../data";

export function RecentAddresses() {
  return (
    <section aria-labelledby="recent-title" className="mt-4">
      <h2 id="recent-title" className="px-8 text-[13px] leading-[18px] font-medium text-[#adadad]">
        Recent addresses
      </h2>
      <ul className="mt-1.5">
        {RECENT_ADDRESSES.map(({ address, note }) => (
          <li key={address}>
            <Link
              href={reviewHref(address)}
              transitionTypes={["push"]}
              className="mx-4 flex items-center gap-3 rounded-[18px] px-[14px] py-1.5 transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-fuse-blue active:bg-black/[0.04] [@media(hover:hover)]:hover:bg-black/[0.025]"
            >
              <span className="grid size-[42px] shrink-0 place-items-center rounded-full bg-black/[0.09] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.03)]">
                <CardholderIcon weight="fill" size={20} />
              </span>
              <span className="flex flex-col">
                <span className="text-[16px] leading-5 font-medium">{shortAddress(address)}</span>
                <span className="text-[13px] leading-[18px] text-[#adadad]">{note}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
