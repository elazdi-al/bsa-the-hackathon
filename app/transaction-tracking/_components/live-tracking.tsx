import { useState } from "react";
import type { Hex } from "viem";
import { phoneDate, useWallet } from "@/app/(tabs)/_components/wallet";
import { shortAddress } from "@/app/choose-recipient/data";
import { SendIcon } from "@/components/icons";
import { scheduledSteps, sendSteps, type Tracked } from "../data";
import { Tracking } from "./transaction-sheet";

/** `hash` is the transaction, or for a payment Swissquote holds, its operation; `leaves` is its release in chain seconds. */
export type Live = { hash: Hex; amount: string; to: string; leaves?: number };

/** A send the phone just approved. Approval resolves once it is on-chain, so it arrives completed, or once it is scheduled. */
export function LiveTracking({ hash, amount, to, leaves }: Live) {
  const wallet = useWallet();
  const [date] = useState(() =>
    new Date().toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }),
  );
  const held = leaves !== undefined;
  const steps = held ? scheduledSteps : sendSteps;
  // Opened from Send, the wallet is already read; on a cold visit, until it is, the chain's clock is taken as the phone's.
  const skew = wallet.status === "ready" ? wallet.wallet.skew : 0;

  const tx: Tracked = {
    title: held ? "USDC Scheduled" : "USDC Sent",
    usd: Number(amount),
    amount: `${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC`,
    date,
    steps,
    rows: [
      { label: "To", value: shortAddress(to) },
      { label: "From", value: "Your Swissquote Wallet" },
      ...(held ? [{ label: "Leaves", value: phoneDate({ skew }, leaves) }] : []),
    ],
    rail: { label: "Network", value: "Base" },
    txHash: held ? undefined : hash,
    networkFee: "Free",
    feePaidBy: "paid by Swissquote",
  };

  return <Tracking tx={tx} step={held ? steps.findIndex((s) => s.id === "scheduled") : steps.length - 1} badge={SendIcon} />;
}
