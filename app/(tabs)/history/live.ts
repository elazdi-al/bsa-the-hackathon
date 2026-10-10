import { useEffect, useRef } from "react";
import { formatUnits, isAddressEqual, zeroAddress } from "viem";
import type { Transfer } from "@/lib/wallet/phone";
import { DECIMALS } from "@/lib/wallet/pool";
import { shortAddress } from "@/app/choose-recipient/data";
import { onPhoneClock, useActivity, useWallet, type Wallet } from "../_components/wallet";
import type { Tx } from "./data";

type Owner = Pick<Wallet, "address" | "skew" | "ethPrice">;

const pad = (n: number) => String(n).padStart(2, "0");
const amountOf = (t: Transfer) => Number(formatUnits(BigInt(t.value), DECIMALS[t.token]));
// Four decimals like the demo rows, but a dust amount keeps two significant digits instead of reading 0.0000.
const ethFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4, maximumSignificantDigits: 2, roundingPriority: "morePrecision" });
const usdcFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eth = (n: number) => `${ethFmt.format(n)} ETH`;

/**
 * A transfer's date and time on this phone's local wall clock, so a send after `npm run warp` still lands under
 * Today, written in the UTC-formatted fields the mock rows use so they read as local time.
 */
function when(transfer: Transfer, wallet: Owner) {
  const at = onPhoneClock(wallet, transfer.timestamp);
  return { date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`, time: `${pad(at.getHours())}:${pad(at.getMinutes())}` };
}

/** One transfer as its own row: USDC moves Cash, WETH moves the ETH in Investments. */
function transferToTx(transfer: Transfer, wallet: Owner): Tx {
  const out = isAddressEqual(transfer.from, wallet.address);
  const other = out ? transfer.to : transfer.from;
  const minted = isAddressEqual(transfer.from, zeroAddress);
  const amount = amountOf(transfer);
  const isEth = transfer.token === "weth";
  return {
    id: `${transfer.hash}:${isEth ? "weth:" : ""}${out ? "out" : "in"}`,
    account: isEth ? "investments" : "cash",
    kind: out ? "send" : "receive",
    title: minted ? `Test ${isEth ? "ETH" : "USDC"} added` : out ? `Sent to ${shortAddress(other)}` : `Received from ${shortAddress(other)}`,
    detail: isEth ? "ETH" : "USDC",
    ...when(transfer, wallet),
    usd: isEth ? amount * (wallet.ethPrice ?? 0) : amount,
    flow: out ? "out" : "in",
    ...(isEth && { crypto: eth(amount) }),
    status: "Completed",
    rows: [{ label: out ? "To" : "From", value: minted ? "Local test faucet" : shortAddress(other) }],
    // Swissquote's paymaster paid for the wallet's own sends; an incoming payment's fee was the sender's.
    fee: out,
    hash: transfer.hash,
  };
}

/** A transaction that paid one token into the pool and got the other back, as one swap row on Cash. */
function swapToTx(paid: Transfer, got: Transfer, wallet: Owner): Tx {
  const toEth = paid.token === "usdc";
  const [usdc, weth] = toEth ? [amountOf(paid), amountOf(got)] : [amountOf(got), amountOf(paid)];
  return {
    id: `${paid.hash}:swap`,
    account: "cash",
    kind: "swap",
    title: toEth ? "USDC to ETH" : "ETH to USDC",
    detail: "Swap",
    ...when(paid, wallet),
    usd: usdc,
    flow: "swap",
    ...(toEth && { crypto: eth(weth) }),
    status: "Completed",
    rows: [
      { label: "Paid", value: toEth ? `${usdcFmt.format(usdc)} USDC` : eth(weth) },
      { label: "Rate", value: `1 ETH = ${usdcFmt.format(usdc / weth)} USDC` },
    ],
    fee: true,
    hash: paid.hash,
  };
}

/** The wallet's transfers as History rows, newest first: a swap's two transfers make one row, every other transfer its own. */
export function toTxs(transfers: Transfer[], wallet: Owner): Tx[] {
  const byHash = new Map<string, Transfer[]>();
  for (const t of transfers) byHash.set(t.hash, [...(byHash.get(t.hash) ?? []), t]);
  return [...byHash.values()].flatMap((group) => {
    const paid = group.find((t) => isAddressEqual(t.from, wallet.address));
    const got = group.find((t) => isAddressEqual(t.to, wallet.address));
    const swap = group.length === 2 && paid && got && paid.token !== got.token;
    return swap ? [swapToTx(paid, got, wallet)] : group.map((t) => transferToTx(t, wallet));
  });
}

/**
 * The wallet's transfers as History rows, newest first; none on the server or before the first read. `arrived` picks
 * the rows that came in after the list first painted, on the render that mounts them, so each fades in once.
 */
export function useLiveTxs() {
  const wallet = useWallet();
  const transfers = useActivity();
  const txs = wallet.status === "ready" && transfers ? toTxs(transfers, wallet.wallet) : [];
  // The ids at the last commit. A row filtered out when it came in is known by the time a filter shows it.
  const known = useRef<Set<string>>(undefined);
  useEffect(() => {
    known.current = new Set(txs.map((t) => t.id));
  });
  // Once the wallet is read, Cash is real: its demo rows would contradict the balance.
  return { txs, real: wallet.status === "ready", arrived: (tx: Tx) => !!known.current && txs.includes(tx) && !known.current.has(tx.id) };
}
