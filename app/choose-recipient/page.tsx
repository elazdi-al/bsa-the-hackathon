import type { Metadata } from "next";
import { RecipientSheetRoute } from "./_components/recipient-sheet";

export const metadata: Metadata = { title: "Choose recipient" };

export default function Page() {
  return (
    <main className="min-h-dvh bg-white">
      <RecipientSheetRoute />
    </main>
  );
}
