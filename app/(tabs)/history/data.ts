import type { TileId } from "../home/data";

export type Kind = "receive" | "send" | "swap" | "reward" | "deposit" | "card" | "membership" | "withdrawal";

export type Tx = {
  id: string;
  /** The Home account it moved money in or out of. */
  account: TileId;
  kind: Kind;
  title: string;
  /** Detail after the time in the list subtitle. */
  detail: string;
  /** "YYYY-MM-DD" and "HH:mm". */
  date: string;
  time: string;
  /** Fiat value in USD. */
  usd: number;
  /** "in" is green with +, "out" is ink with −, "swap" is unsigned. */
  flow: "in" | "out" | "swap";
  /** Secondary line under the fiat value. */
  crypto?: string;
  status: "Completed" | "Pending";
  /** Detail-drawer rows between the amount and the fee/id/status block. */
  rows: { label: string; value: string }[];
  /** Whether the drawer shows the free network fee. */
  fee?: boolean;
  /** Onchain signature for the drawer. */
  hash?: string;
};

/** The mock "now" for the whole app (UTC, so server and client format identically). */
export const now = Date.UTC(2025, 2, 12, 14, 0);

const stamp = new Date(now).toISOString();
const today = stamp.slice(0, 10);

/** Newest first, within each day too: the list renders in this order. */
export const transactions: Tx[] = [
  { id: "t1", account: "card", kind: "card", title: "Blue Bottle Coffee", detail: "Swissquote Card", date: "2025-03-12", time: "13:48", usd: 6.5, flow: "out", status: "Pending",
    rows: [{ label: "Merchant", value: "Blue Bottle Coffee" }, { label: "Card", value: "Swissquote Visa ••••4218" }] },
  { id: "t2", account: "investments", kind: "receive", title: "Received from toly.sol", detail: "86xC...2MMY", date: "2025-03-12", time: "11:36", usd: 119.51, flow: "in", crypto: "0.92 SOL", status: "Completed",
    rows: [{ label: "From", value: "toly.sol (86xC...2MMY)" }], fee: true, hash: "5Hq2YvT8nWk3LrPz9XcB4mJdA7sEu1fGo6iNtRw2KxVb" },
  { id: "t3", account: "cash", kind: "send", title: "Sent to Solana wallet", detail: "Ledger", date: "2025-03-12", time: "09:30", usd: 250, flow: "out", crypto: "250.00 USDC", status: "Completed",
    rows: [{ label: "To", value: "Solana wallet (Ledger)" }], fee: true, hash: "2Zp7KmQe4VdXr8LwTn3YcBj6AfGs9uHo1iNtRb5WxCvE" },
  { id: "t4", account: "investments", kind: "swap", title: "SOL to USDC", detail: "Swap", date: "2025-03-11", time: "18:20", usd: 259.8, flow: "swap", crypto: "259.80 USDC", status: "Completed",
    rows: [{ label: "Paid", value: "2.00 SOL" }, { label: "Rate", value: "1 SOL = 129.90 USDC" }], fee: true, hash: "4Rk9LmTq2WvXz7NcBe3YdPj8AfGs5uHo6iEtRb1WxCvK" },
  { id: "t5", account: "cash", kind: "withdrawal", title: "USDC Withdrawal", detail: "Revolut ••••1342", date: "2025-03-11", time: "10:07", usd: 1508.5, flow: "out", crypto: "1,508.50 USDC", status: "Completed", rows: [] },
  { id: "t6", account: "card", kind: "card", title: "Uber Eats", detail: "Swissquote Card", date: "2025-03-11", time: "08:45", usd: 24.9, flow: "out", status: "Completed",
    rows: [{ label: "Merchant", value: "Uber Eats" }, { label: "Card", value: "Swissquote Visa ••••4218" }] },
  { id: "t7", account: "earn", kind: "reward", title: "Staking reward", detail: "Solana", date: "2025-03-10", time: "16:05", usd: 649.5, flow: "in", crypto: "5.00 SOL", status: "Completed",
    rows: [{ label: "From", value: "Solana staking" }], fee: true, hash: "3Wm8KqTe5VdXr2LwNn7YcBj9AfGs4uHo1iPtRb6WxCvZ" },
  { id: "t8", account: "cash", kind: "deposit", title: "Bank deposit", detail: "Bridge", date: "2025-03-10", time: "09:12", usd: 2500, flow: "in", crypto: "2,500.00 USDC", status: "Completed",
    rows: [{ label: "From", value: "Bank transfer via Bridge" }, { label: "Payment rail", value: "ACH Same Day" }], fee: true, hash: "6Tn3LmQp8WvXz4KcBe9YdRj2AfGs7uHo5iEtNb1WxCvA" },
  { id: "t9", account: "investments", kind: "swap", title: "USDC to JUP", detail: "Swap", date: "2025-03-07", time: "19:30", usd: 100, flow: "swap", crypto: "142.86 JUP", status: "Completed",
    rows: [{ label: "Paid", value: "100.00 USDC" }, { label: "Rate", value: "1 JUP = 0.70 USDC" }], fee: true, hash: "8Ys5KmTq3WvXz9NcBe2YdPj6AfGs1uHo4iRtLb7WxCvQ" },
  { id: "t10", account: "card", kind: "card", title: "Spotify", detail: "Swissquote Card", date: "2025-03-07", time: "12:10", usd: 11.99, flow: "out", status: "Completed",
    rows: [{ label: "Merchant", value: "Spotify" }, { label: "Card", value: "Swissquote Visa ••••4218" }] },
  { id: "t11", account: "cash", kind: "receive", title: "Received PYUSD", detail: "9Qk2...vT4n", date: "2025-03-05", time: "14:22", usd: 300, flow: "in", crypto: "300.00 PYUSD", status: "Completed",
    rows: [{ label: "From", value: "9Qk2...vT4n" }], fee: true, hash: "7Vp4LmQe9WkXr3NcBt8YdAj5HfGs2uHo6iEzRb1WxCvM" },
  { id: "t12", account: "investments", kind: "swap", title: "SOL to JTO", detail: "Swap", date: "2025-03-05", time: "08:50", usd: 389.7, flow: "swap", crypto: "203.71 JTO", status: "Completed",
    rows: [{ label: "Paid", value: "3.00 SOL" }, { label: "Rate", value: "1 SOL = 67.91 JTO" }], fee: true, hash: "9Bn6KmTq1WvXz5LcPe4YdRj8AfGs3uHo2iEtNb7WxCvD" },
  { id: "t14", account: "cash", kind: "send", title: "Sent to 9Qk2...vT4n", detail: "Wallet", date: "2025-02-28", time: "17:40", usd: 75, flow: "out", crypto: "75.00 USDC", status: "Completed",
    rows: [{ label: "To", value: "9Qk2...vT4n" }], fee: true, hash: "1Dp7LmQe3WkXr9NcBt2YdAj6HfGs8uHo4iEzRb5WxCvY" },
  { id: "t13", account: "card", kind: "membership", title: "Swissquote Plus", detail: "Monthly membership", date: "2025-02-28", time: "10:00", usd: 4.99, flow: "out", status: "Completed",
    rows: [{ label: "Plan", value: "Swissquote Plus, monthly" }, { label: "Paid with", value: "Swissquote Visa ••••4218" }] },
  { id: "t15", account: "cash", kind: "deposit", title: "Bank deposit", detail: "Bridge", date: "2025-02-24", time: "13:05", usd: 1200, flow: "in", crypto: "1,200.00 USDC", status: "Completed",
    rows: [{ label: "From", value: "Bank transfer via Bridge" }, { label: "Payment rail", value: "ACH Same Day" }], fee: true, hash: "5Hn2KmTq7WvXz1LcPe8YdRj4AfGs6uHo3iEtNb9WxCvF" },
  { id: "t16", account: "card", kind: "card", title: "Whole Foods", detail: "Swissquote Card", date: "2025-02-24", time: "09:20", usd: 63.42, flow: "out", status: "Completed",
    rows: [{ label: "Merchant", value: "Whole Foods Market" }, { label: "Card", value: "Swissquote Visa ••••4218" }] },
  { id: "t17", account: "earn", kind: "reward", title: "Staking reward", detail: "Solana", date: "2025-02-18", time: "16:05", usd: 623.52, flow: "in", crypto: "4.80 SOL", status: "Completed",
    rows: [{ label: "From", value: "Solana staking" }], fee: true, hash: "2Cq8LmTe6WvXr4KcBt1YdPj9AfGs5uHo7iEzNb3WxCvG" },
];

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });

export function dayLabel(iso: string) {
  const diff = (Date.parse(today) - Date.parse(iso)) / 86_400_000;
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return dayFmt.format(Date.parse(iso));
}

export function fullDate(t: Tx) {
  return `${dateFmt.format(Date.parse(t.date))} at ${t.time}`;
}

export type Filter = "all" | "sent" | "received" | "swaps";

/** The segmented control, the list predicate and the empty state all read from here. `flow` partitions every transaction. */
export const filters = {
  all: { label: "All", noun: "transactions", match: () => true },
  sent: { label: "Sent", noun: "outgoing payments", match: (t) => t.flow === "out" },
  received: { label: "Received", noun: "incoming payments", match: (t) => t.flow === "in" },
  swaps: { label: "Swaps", noun: "swaps", match: (t) => t.flow === "swap" },
} satisfies Record<Filter, { label: string; noun: string; match: (t: Tx) => boolean }>;

/** Day groups in the order of `txs`. */
export function byDay(txs: Tx[]) {
  // Not Map.groupBy: it needs Safari 17.4, and this list must open on older iPhones too.
  const days = new Map<string, Tx[]>();
  for (const t of txs) days.set(t.date, [...(days.get(t.date) ?? []), t]);
  return Array.from(days, ([date, items]) => ({ date, label: dayLabel(date), items }));
}

export function monthSummary(txs: Tx[]) {
  const month = txs.filter((t) => t.date.startsWith(today.slice(0, 7)));
  const total = (flow: Tx["flow"]) => month.reduce((s, t) => (t.flow === flow ? s + t.usd : s), 0);
  return { month: monthFmt.format(now), in: total("in"), out: total("out") };
}

/** The send that just completed, from the send review's `?sent=<recipient>&amount=<usd>`. */
export function justSent(to: string | undefined, amount: string | undefined): Tx | null {
  const name = to?.trim();
  const usd = Math.round(Number(amount) * 100) / 100;
  if (!name || !Number.isFinite(usd) || usd <= 0) return null;
  return {
    id: "just-sent",
    account: "cash",
    kind: "send",
    title: `Sent to ${name}`,
    detail: "Wallet",
    date: today,
    time: stamp.slice(11, 16),
    usd,
    flow: "out",
    crypto: `${usd.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC`,
    status: "Pending",
    rows: [{ label: "To", value: name }],
    fee: true,
  };
}
