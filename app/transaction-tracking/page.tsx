import type { Metadata } from "next";
import { TransactionRoute } from "./_components/transaction-sheet";
import { WalletBackdrop } from "./_components/wallet-backdrop";

export const metadata: Metadata = { title: "USDC Withdrawal · Fuse" };

export default function Page() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-white">
      <WalletBackdrop />
      <TransactionRoute />
    </main>
  );
}
