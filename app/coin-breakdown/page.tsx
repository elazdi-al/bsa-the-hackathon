import type { Metadata } from "next";
import { RequireWallet } from "@/app/(tabs)/_components/wallet";
import { Screen } from "@/components/navigation";
import { CoinsScreen } from "./_components/coins-screen";

export const metadata: Metadata = { title: "Coins" };

export default function Page() {
  return (
    <Screen>
      <main className="relative min-h-dvh w-full overflow-hidden bg-background">
        <RequireWallet />
        <CoinsScreen />
      </main>
    </Screen>
  );
}
