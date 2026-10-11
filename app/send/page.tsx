import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireWallet } from "@/app/(tabs)/_components/wallet";
import { Screen } from "@/components/navigation";
import { SendReview } from "./_components/send-review";

export const metadata: Metadata = { title: "Send" };

export default function Page() {
  return (
    <Screen>
      <main className="flex min-h-dvh flex-col bg-white pt-[env(safe-area-inset-top)] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <RequireWallet />
        <Suspense>
          <SendReview />
        </Suspense>
      </main>
    </Screen>
  );
}
