import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Address } from "viem";
import { RequireWallet } from "@/app/(tabs)/_components/wallet";
import { recipientFor } from "@/app/choose-recipient/data";
import { LightningIcon, WalletIcon } from "@/components/icons";
import { Screen } from "@/components/navigation";
import { addresses } from "@/lib/wallet/env";
import { SendReview } from "./_components/send-review";

export const metadata: Metadata = { title: "Send" };

export default async function Page({ searchParams }: { searchParams: Promise<{ to?: string | string[] }> }) {
  const to = (await searchParams).to;
  const shown = typeof to === "string" ? recipientFor(to) : null;
  if (typeof to !== "string" || !shown) redirect("/choose-recipient");

  return (
    <Screen>
      <main className="flex min-h-dvh flex-col bg-white pt-[env(safe-area-inset-top)] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <RequireWallet />
        <SendReview to={to} address={shown.address as Address} usdc={addresses.usdc}>
          <section aria-label="Recipient" className="flex items-center gap-4">
            <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
              <WalletIcon />
            </span>
            <p className="min-w-0 flex-1">
              <span className="block truncate text-label">{shown.name}</span>
              <span className="block truncate text-body text-muted-foreground">{shown.detail}</span>
            </p>
          </section>

          <dl className="mt-6 flex items-center justify-between text-body">
            <dt className="text-muted-foreground">Network fee</dt>
            <dd className="flex items-center gap-1 font-semibold text-positive">
              <LightningIcon size={16} />
              Paid by Swissquote
            </dd>
          </dl>
        </SendReview>
      </main>
    </Screen>
  );
}
