import type { Metadata } from "next";
import { Suspense } from "react";
import { LightningIcon } from "@/components/icons";
import { Screen } from "@/components/navigation";
import { SendReview } from "./_components/send-review";

export const metadata: Metadata = { title: "Send" };

export default function Page() {
  return (
    <Screen>
      <main className="flex min-h-dvh flex-col bg-white pt-[env(safe-area-inset-top)] pb-[max(2rem,env(safe-area-inset-bottom))]">
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
      </main>
    </Screen>
  );
}
