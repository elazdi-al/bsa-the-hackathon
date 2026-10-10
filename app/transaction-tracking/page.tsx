import type { Metadata } from "next";
import type { Hex } from "viem";
import { TransactionRoute } from "./_components/transaction-sheet";
import { WalletBackdrop } from "./_components/wallet-backdrop";

export const metadata: Metadata = { title: "Transaction · Fuse" };

type Params = { hash?: string; amount?: string; to?: string };

/** With `hash`, `amount` and `to` it tracks that send; without, the mock USDC withdrawal. */
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const { hash, amount, to } = await searchParams;
  const live = typeof hash === "string" && typeof amount === "string" && typeof to === "string" ? { hash: hash as Hex, amount, to } : undefined;
  return (
    <main className="relative min-h-dvh overflow-hidden bg-white">
      <WalletBackdrop />
      <TransactionRoute live={live} />
    </main>
  );
}
