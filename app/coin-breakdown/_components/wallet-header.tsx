import Link from "next/link";
import { shortAddress } from "@/app/choose-recipient/data";
import { CopyButton } from "@/app/transaction-tracking/_components/copy-button";
import { ClockIcon } from "@/components/icons";
import { BackButton } from "@/components/ui/back-button";
import { wallet } from "../data";

export function WalletHeader() {
  return (
    <header className="flex items-center gap-4 px-[22px]">
      <BackButton fallback="/home" />
      <div className="min-w-0 flex-1">
        <h1 className="text-label">{wallet.name}</h1>
        <CopyButton text={wallet.address} label={`Copy address ${wallet.address}`}>
          <span className="text-body text-muted-foreground">{shortAddress(wallet.address)}</span>
        </CopyButton>
      </div>
      <Link
        href="/history?account=investments"
        replace
        transitionTypes={["pop"]}
        aria-label="History"
        className="-mr-2.5 grid size-11 place-items-center rounded-full text-muted-foreground outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-fuse-blue active:scale-[0.96]"
      >
        <ClockIcon size={24} />
      </Link>
    </header>
  );
}

