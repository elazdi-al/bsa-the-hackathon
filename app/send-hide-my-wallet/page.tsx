import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { recipientFor } from "@/app/choose-recipient/data";
import { LightningIcon, WalletIcon } from "@/components/icons";
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
        <header className="mx-auto mt-4 flex h-10 w-full max-w-md shrink-0 items-center gap-3 px-6">
          <BackButton fallback="/choose-recipient" />
          <h1 className="text-label">Send</h1>
        </header>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 md:justify-center">
          <div className="pt-16 pb-20 text-center md:pt-0">
            <p className="text-display tabular-nums">
              {transfer.amount.whole}
              <span className="text-cents">{transfer.amount.cents}</span>
            </p>
            <p className="mt-2 text-body text-muted-foreground tabular-nums">{transfer.token}</p>
          </div>

          <section aria-label="Recipient" className="flex items-center gap-4">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-[22px] text-muted-foreground">
              {shown.avatar ?? <WalletIcon />}
            </span>
            <p className="min-w-0 flex-1">
              <span className="block truncate text-label">{shown.name}</span>
              <span className="block truncate text-body text-muted-foreground">{shown.detail}</span>
            </p>
            {shown.sends ? <span className="shrink-0 text-body text-muted-foreground tabular-nums">{shown.sends} sends</span> : null}
          </section>

          <dl className="mt-6 flex items-center justify-between text-body">
            <dt className="text-muted-foreground">Network fee</dt>
            <dd className="flex items-center gap-1 font-semibold text-positive">
              <LightningIcon size={16} />
              Covered
              <span className="sr-only"> by Fuse Plus</span>
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
