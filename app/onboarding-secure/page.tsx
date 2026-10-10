import type { Metadata } from "next";
import { Screen } from "@/components/navigation";
import { SecureFlow } from "./_components/secure-flow";

export const metadata: Metadata = { title: "Secure your wallet" };

export default function Page() {
  return (
    <Screen>
      <main className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-white">
        <SecureFlow />
      </main>
    </Screen>
  );
}
