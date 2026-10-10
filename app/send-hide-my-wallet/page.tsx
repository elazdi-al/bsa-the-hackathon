import { CardholderIcon } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { recipientFor } from "@/app/choose-recipient/data";
import { Screen } from "@/components/navigation";
import { BackButton } from "@/components/ui/back-button";
import { HideMyWallet } from "./_components/hide-my-wallet";
import { recipient, transfer, type Recipient } from "./data";

export const metadata: Metadata = { title: "Send · Fuse" };

export default async function Page({ searchParams }: { searchParams: Promise<{ to?: string | string[] }> }) {
  const { to } = await searchParams;
  const chosen = typeof to === "string" ? recipientFor(to) : null;
  if (to !== undefined && !chosen) redirect("/choose-recipient");
  const shown: Recipient = chosen ?? recipient;

  return (
    <Screen>
      <main className="flex min-h-dvh flex-col bg-white pt-[env(safe-area-inset-top)] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <header className="relative flex h-14 shrink-0 items-center justify-center px-4">
          <BackButton fallback="/choose-recipient" className="absolute left-3.5" />
          <h1 className="text-[17px] font-semibold">Send</h1>
        </header>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-[30px] md:justify-center">
          <div className="pt-16 pb-[84px] text-center md:pt-0">
            <p className="text-[48px] leading-[56px] font-bold tracking-[-0.035em] tabular-nums">
              {transfer.amount.whole}
              <span className="text-cents">{transfer.amount.cents}</span>
            </p>
            <p className="mt-1 text-[15px] text-black/35 tabular-nums">{transfer.token}</p>
          </div>

          <section aria-label="Recipient" className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-[42px] shrink-0 place-items-center rounded-full bg-[#e8e6e7] text-[23px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.03)]"
            >
              {shown.avatar ?? <CardholderIcon weight="fill" size={20} />}
            </span>
            <p className="min-w-0 flex-1 text-[15px] leading-5 tracking-[-0.24px]">
              <span className="block truncate font-semibold">{shown.name}</span>
              <span className="block truncate text-black/35">{shown.detail}</span>
            </p>
            {shown.sends ? (
              <span className="flex h-[26px] items-center rounded-full px-2.5 text-[12px] tabular-nums shadow-[0_0_0_1px_rgb(0_0_0/0.07)]">
                {shown.sends} sends
              </span>
            ) : null}
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
              <span className="text-positive">Covered</span>
            </dd>
          </dl>

          <div className="mt-auto pt-10 md:mt-0">
            <HideMyWallet to={typeof to === "string" ? to : undefined} label={shown.name} />
          </div>
        </div>
      </main>
    </Screen>
  );
}
