import { PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { shortAddress } from "@/app/choose-recipient/data";
import { settled, type Operation } from "@/lib/wallet/browser";
import { sendSteps, type Tracked } from "../data";
import { Tracking } from "./transaction-sheet";

export type Live = { hash: Hex; amount: string; to: string };

/** A send the phone just signed: the Wallet API reports it from the bundler until it lands on-chain. */
export function LiveTracking({ hash, amount, to }: Live) {
  const [op, setOp] = useState<Operation>({ status: "pending" });
  const [date] = useState(() =>
    new Date().toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }),
  );

  useEffect(() => {
    const abort = new AbortController();
    settled(hash, abort.signal).then(setOp);
    return () => abort.abort();
  }, [hash]);

  const failed = op.status === "failed";
  const tx: Tracked = {
    title: "USDC Sent",
    usd: Number(amount),
    amount: `${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC`,
    date,
    steps: failed ? [...sendSteps.slice(0, -1), { id: "failed", label: "Failed" }] : sendSteps,
    rows: [
      { label: "To", value: shortAddress(to) },
      { label: "From", value: "Your Swissquote Wallet" },
      ...(failed ? [{ label: "Reason", value: op.reason ?? "The transaction reverted" }] : []),
    ],
    rail: { label: "Network", value: "Base Sepolia" },
    // The user operation's hash until the bundler reports the transaction that carried it.
    txHash: op.status === "pending" ? hash : op.transactionHash,
    networkFee: "Free",
    feePaidBy: "paid by Swissquote",
  };

  return <Tracking tx={tx} step={op.status === "pending" ? 1 : 2} badge={PaperPlaneTiltIcon} />;
}
