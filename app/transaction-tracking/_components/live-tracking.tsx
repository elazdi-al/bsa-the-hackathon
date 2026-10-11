import { useState } from "react";
import type { Hex } from "viem";
import { shortAddress } from "@/app/choose-recipient/data";
import { SendIcon } from "@/components/icons";
import { ethAmount } from "@/lib/wallet/account";
import { sendSteps, type Tracked } from "../data";
import { Tracking } from "./transaction-sheet";

/** `fee`: the most the wallet pays in gas, in wei, when Swissquote doesn't sponsor it. */
export type Live = { hash: Hex; amount: string; to: string; fee?: string };

/** A send the phone just approved. Approval resolves once it is on-chain, so it arrives completed. */
export function LiveTracking({ hash, amount, to, fee }: Live) {
  const [date] = useState(() =>
    new Date().toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }),
  );

  const tx: Tracked = {
    title: "USDC Sent",
    usd: Number(amount),
    amount: `${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC`,
    date,
    steps: sendSteps,
    rows: [
      { label: "To", value: shortAddress(to) },
      { label: "From", value: "Your Swissquote Wallet" },
    ],
    rail: { label: "Network", value: "Base" },
    txHash: hash,
    fee: fee && ethAmount(BigInt(fee)),
  };

  return <Tracking tx={tx} step={sendSteps.length - 1} badge={SendIcon} />;
}
