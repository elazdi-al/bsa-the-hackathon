import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireWallet } from "@/app/(tabs)/_components/wallet";
import { TransactionRoute } from "./_components/transaction-sheet";
import { WalletBackdrop } from "./_components/wallet-backdrop";

export const metadata: Metadata = { title: "Transaction" };

export default function Page() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-white">
      <RequireWallet />
      <WalletBackdrop />
      <Suspense>
        <TransactionRoute />
      </Suspense>
    </main>
  );
}
