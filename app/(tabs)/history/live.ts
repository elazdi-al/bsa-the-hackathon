import { formatUnits, isAddressEqual, zeroAddress, type Address } from "viem";
import type { Transfer } from "@/lib/wallet/phone";
import { shortAddress } from "@/app/choose-recipient/data";
import type { Tx } from "./data";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * An on-chain USDC transfer as a History row on the Cash account. Its date and time are this phone's
 * local wall clock, written in the UTC-formatted fields the mock rows use, so they read as local time.
 */
export function transferToTx(transfer: Transfer, wallet: Address): Tx {
  const out = isAddressEqual(transfer.from, wallet);
  const other = out ? transfer.to : transfer.from;
  const minted = isAddressEqual(transfer.from, zeroAddress);
  const at = new Date(transfer.timestamp * 1000);
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
