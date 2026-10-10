import type { Metadata } from "next";
import { Screen } from "@/components/navigation";
import { WelcomeFlow } from "./_components/welcome-flow";

export const metadata: Metadata = { title: "Welcome · Fuse" };

export default function Page() {
  return (
    <Screen>
      <main className="relative min-h-dvh overflow-hidden bg-white">
        <WelcomeFlow />
      </main>
    </Screen>
  );
}
