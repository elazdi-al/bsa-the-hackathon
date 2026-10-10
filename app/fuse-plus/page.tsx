import type { Metadata, Viewport } from "next";
import { Welcome } from "./_components/welcome";

export const metadata: Metadata = { title: "Fuse Plus" };

export const viewport: Viewport = { themeColor: "#4a5776" };

export default function Page() {
  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-[430px] overflow-hidden bg-black bg-[linear-gradient(180deg,#4a5776,#38435d_60px,#2b3548_100px,#1c2230_150px,#0d1016_220px,#040406_290px,#000_340px)]">
      <Welcome />
    </main>
  );
}
