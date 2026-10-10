import type { Metadata } from "next";
import { CoinsScreen } from "./_components/coins-screen";

export const metadata: Metadata = { title: "Coins · Fuse" };

export default function Page() {
  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#eeeeee]">
      <CoinsScreen />
    </main>
  );
}
