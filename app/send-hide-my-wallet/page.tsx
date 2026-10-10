import type { Metadata } from "next";
import { Suspense } from "react";
import { LightningIcon } from "@/components/icons";
import { Screen } from "@/components/navigation";
import { BackButton } from "@/components/ui/back-button";
import { SendReview } from "./_components/send-review";

export const metadata: Metadata = { title: "Send · Fuse" };

export default function Page() {
  return (
    <Screen>
      <main className="flex min-h-dvh flex-col bg-white pt-[env(safe-area-inset-top)] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <header className="mx-auto mt-4 flex h-10 w-full max-w-md shrink-0 items-center gap-3 px-6">
          <BackButton fallback="/choose-recipient" />
          <h1 className="text-label">Send</h1>
        </header>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 md:justify-center">
          <Suspense>
            <SendReview>
              <dl className="mt-6 flex items-center justify-between text-body">
                <dt className="text-muted-foreground">Network fee</dt>
                <dd className="flex items-center gap-1 font-semibold text-positive">
                  <LightningIcon size={16} />
                  Paid by Swissquote
                </dd>
              </dl>
            </SendReview>
          </Suspense>
        </div>
      </main>
    </Screen>
  );
}
