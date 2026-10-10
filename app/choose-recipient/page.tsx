import type { Metadata } from "next";
import { AddressCard } from "./_components/address-card";
import { RecentAddresses } from "./_components/recent-addresses";
import { RecipientSheet } from "./_components/recipient-sheet";

export const metadata: Metadata = { title: "Choose recipient · Fuse" };

export default function Page() {
  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-[430px] overflow-hidden bg-[#c5c5c5]">
      <RecipientSheet>
        <AddressCard />
        <RecentAddresses />
      </RecipientSheet>
    </main>
  );
}
