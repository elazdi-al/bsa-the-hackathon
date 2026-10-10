import { CaretLeftIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HideMyWallet } from "./_components/hide-my-wallet";
import { recipient, transfer } from "./data";

export default function Page() {
  return (
    <main className="flex min-h-dvh flex-col bg-white pt-[env(safe-area-inset-top)] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="relative flex h-14 shrink-0 items-center justify-center px-4">
        <Button
          nativeButton={false}
          render={<Link href="/choose-recipient" />}
          aria-label="Back"
          variant="secondary"
          size="icon"
          className="absolute left-4 size-10"
        >
          <CaretLeftIcon aria-hidden weight="bold" className="size-[18px]" />
        </Button>
        <h1 className="text-[17px] font-semibold">Send</h1>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-[30px] md:justify-center">
        <div className="pt-16 pb-[84px] text-center md:pt-0">
          <p className="text-[48px] leading-[56px] font-bold tracking-[-0.035em] tabular-nums">
            {transfer.amount.whole}
            <span className="text-black/25">{transfer.amount.cents}</span>
          </p>
          <p className="mt-1 text-[15px] text-black/35 tabular-nums">{transfer.token}</p>
        </div>

        <section aria-label="Recipient" className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-[42px] shrink-0 place-items-center rounded-full bg-[#e8e6e7] text-[23px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.03)]"
          >
            {recipient.avatar}
          </span>
          <p className="min-w-0 flex-1 text-[15px] leading-5 tracking-[-0.24px]">
            <span className="block font-semibold">{recipient.name}</span>
            <span className="block text-black/35">{recipient.wallet}</span>
          </p>
          <span className="flex h-[26px] items-center rounded-full px-2.5 text-[12px] tabular-nums shadow-[0_0_0_1px_rgb(0_0_0/0.07)]">
            {recipient.sends} sends
          </span>
        </section>

        <hr className="mt-6 h-px border-0 bg-[repeating-linear-gradient(90deg,#e4e4e4_0_8px,transparent_8px_17px)]" />

        <dl className="flex items-center justify-between pt-3 text-[15px] leading-5 tracking-[-0.24px]">
          <dt className="text-black/35">Onchain fees</dt>
          <dd>
            <span className="text-black/35">
              Fuse
              <sup aria-hidden className="text-[11px]">
                +
              </sup>
              <span className="sr-only"> Plus</span>
            </span>{" "}
            <span className="text-[#30b256]">Covered</span>
          </dd>
        </dl>

        <div className="mt-auto pt-10 md:mt-0">
          <HideMyWallet />
        </div>
      </div>
    </main>
  );
}
