import { ClockIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { shortAddress } from "@/app/choose-recipient/data";
import { CopyButton } from "@/app/transaction-tracking/_components/copy-button";
import { BackButton } from "@/components/ui/back-button";
import { wallet } from "../data";

export function WalletHeader() {
  return (
    <header className="flex items-center gap-4 px-[22px]">
      <BackButton fallback="/home" className="-mr-1" />
      <span aria-hidden className="grid size-[42px] shrink-0 place-items-center rounded-full bg-[#e6e6e6]">
        <FuseMark />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-[17px]/[22px] font-semibold tracking-[-0.01em]">{wallet.name}</h1>
        <CopyButton text={wallet.address} label={`Copy address ${wallet.address}`}>
          <span className="text-[15px] leading-5 text-[#8a8a8a]">{shortAddress(wallet.address)}</span>
        </CopyButton>
      </div>
      <Link
        href="/history?account=investments"
        replace
        transitionTypes={["pop"]}
        aria-label="History"
        className="-mr-2.5 grid size-11 place-items-center rounded-full text-[#b7b7b7] outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-black/20 active:scale-[0.96]"
      >
        <ClockIcon weight="fill" mirrored className="size-6" />
      </Link>
    </header>
  );
}

function FuseMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-[15px] text-[#b2b2b2]">
      <g fill="currentColor">
        <circle cx="4.5" cy="4.5" r="3.8" />
        <circle cx="4.5" cy="19" r="4.3" />
        <circle cx="20.5" cy="4.5" r="3" />
        <circle cx="20.7" cy="19.7" r="3.2" />
      </g>
      <path d="M4.5 4.5V19M4.5 4.5h16" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}
