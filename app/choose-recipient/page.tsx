import type { Metadata } from "next";
import { AddressCard } from "./_components/address-card";
import { RecentAddresses } from "./_components/recent-addresses";
import { RecipientSheet } from "./_components/recipient-sheet";

export const metadata: Metadata = { title: "Choose recipient · Fuse" };

export default function Page() {
  return (
    <main className="min-h-dvh bg-white">
      <RecipientSheet>
        <AddressCard />
        <RecentAddresses />
      </RecipientSheet>
    </main>
  );
}
