import type { Metadata } from "next";
import { Screen } from "@/components/navigation";
import { BackButton } from "@/components/ui/back-button";
import { RecoveryFlow } from "./_components/recovery-flow";

export const metadata: Metadata = { title: "Recover your wallet" };

export default function Page() {
  return (
    <Screen>
      <main className="relative grid min-h-dvh w-full place-items-center overflow-hidden bg-background px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        {/* Where Swissquote Plus keeps its close: the top right of the content column, not the window's corner. */}
        <div className="absolute inset-x-0 top-0 mx-auto flex max-w-md justify-end px-4 pt-[calc(env(safe-area-inset-top)+8px)]">
          <BackButton kind="close" fallback="/onboarding-welcome" />
        </div>
        <RecoveryFlow />
      </main>
    </Screen>
  );
}
