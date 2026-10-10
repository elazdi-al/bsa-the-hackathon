import type { Metadata } from "next";
import { CoinsScreen } from "./_components/coins-screen";

export const metadata: Metadata = { title: "Coins · Fuse" };

export default function Page() {
  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-[430px] overflow-hidden bg-[#eeeeee]">
      <CoinsScreen />
    </main>
  );
}
