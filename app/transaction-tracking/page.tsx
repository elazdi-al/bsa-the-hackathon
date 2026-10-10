import type { Metadata } from "next";
import { TransactionSheet } from "./_components/transaction-sheet";
import { WalletBackdrop } from "./_components/wallet-backdrop";

export const metadata: Metadata = { title: "USDC Withdrawal · Fuse" };

export default function Page() {
  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-[430px] overflow-hidden bg-white">
      <WalletBackdrop />
      <TransactionSheet />
    </main>
  );
}
