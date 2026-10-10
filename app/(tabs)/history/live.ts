import { useEffect, useRef } from "react";
import { formatUnits, isAddressEqual, zeroAddress } from "viem";
import type { Transfer } from "@/lib/wallet/phone";
import { shortAddress } from "@/app/choose-recipient/data";
import { onPhoneClock, useActivity, useWallet, type Wallet } from "../_components/wallet";
import type { Tx } from "./data";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * An on-chain USDC transfer as a History row on the Cash account. Its date and time are this phone's local
 * wall clock, so a send after `npm run warp` still lands under Today, written in the UTC-formatted fields the
 * mock rows use so they read as local time.
 */
export function transferToTx(transfer: Transfer, wallet: Pick<Wallet, "address" | "skew">): Tx {
  const out = isAddressEqual(transfer.from, wallet.address);
  const other = out ? transfer.to : transfer.from;
  const minted = isAddressEqual(transfer.from, zeroAddress);
  const at = onPhoneClock(wallet, transfer.timestamp);
  const usd = Number(formatUnits(BigInt(transfer.value), 6));
  return {
    id: `${transfer.hash}:${out ? "out" : "in"}`,
    account: "cash",
    kind: out ? "send" : "receive",
    title: minted ? "Test USDC added" : out ? `Sent to ${shortAddress(other)}` : `Received from ${shortAddress(other)}`,
    detail: "USDC",
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
    usd,
    flow: out ? "out" : "in",
    status: "Completed",
    rows: [{ label: out ? "To" : "From", value: minted ? "Local test faucet" : shortAddress(other) }],
    // Swissquote's paymaster paid for the wallet's own sends; an incoming payment's fee was the sender's.
    fee: out,
    hash: transfer.hash,
  };
}

/**
 * The wallet's transfers as History rows, newest first; none on the server or before the first read. `arrived` picks
 * the rows that came in after the list first painted, on the render that mounts them, so each fades in once.
 */
export function useLiveTxs() {
  const wallet = useWallet();
  const transfers = useActivity();
  const txs = wallet.status === "ready" && transfers ? transfers.map((t) => transferToTx(t, wallet.wallet)) : [];
  // The ids at the last commit. A row filtered out when it came in is known by the time a filter shows it.
  const known = useRef<Set<string>>(undefined);
  useEffect(() => {
    known.current = new Set(txs.map((t) => t.id));
  });
  return { txs, arrived: (tx: Tx) => !!known.current && txs.includes(tx) && !known.current.has(tx.id) };
}
