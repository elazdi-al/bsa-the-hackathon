import type { Metadata } from "next";
import { RequireWallet } from "@/app/(tabs)/_components/wallet";
import { RecipientSheetRoute } from "./_components/recipient-sheet";

export const metadata: Metadata = { title: "Choose recipient" };

export default function Page() {
  return (
    <main className="min-h-dvh bg-white">
      <RequireWallet />
      <RecipientSheetRoute />
    </main>
  );
}
