import type { Metadata } from "next";
import { Screen } from "@/components/navigation";
import { CoinsScreen } from "./_components/coins-screen";

export const metadata: Metadata = { title: "Coins · Fuse" };

export default function Page() {
  return (
    <Screen>
      <main className="relative min-h-dvh w-full overflow-hidden bg-[#eeeeee]">
        <CoinsScreen />
      </main>
    </Screen>
  );
}
