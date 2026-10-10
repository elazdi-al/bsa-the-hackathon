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
  /** "in" is green with +; "out" and "swap" are plain ink. */
  flow: "in" | "out" | "swap";
  /** Secondary line under the fiat value, for tokens that aren't dollars. */
  crypto?: string;
  status: "Completed" | "Pending";
  /** Detail-drawer rows between the amount and the fee/id/status block. */
  rows: { label: string; value: string }[];
  /** Whether the drawer shows the free network fee. */
  fee?: boolean;
  /** Onchain signature for the drawer. */
  hash?: string;
};

/** Newest first, within each day too: the list renders in this order. */
export const transactions: Tx[] = [
  { id: "t1", account: "card", kind: "card", title: "Blue Bottle Coffee", detail: "Swissquote Card", date: "2025-03-12", time: "13:48", usd: 6.5, flow: "out", status: "Pending",
    rows: [{ label: "Card", value: "Swissquote Visa ••••4218" }] },
  { id: "t2", account: "investments", kind: "receive", title: "Received from jesse.base.eth", detail: "0x123A...7D5f", date: "2025-03-12", time: "11:36", usd: 119.5, flow: "in", crypto: "0.0478 ETH", status: "Completed",
    rows: [{ label: "From", value: "jesse.base.eth (0x123A...7D5f)" }], fee: true, hash: "0xfdeb60df1ab8a8e4b339a349b2aa52e35983e979738e118e71eca02b795b73a4" },
  { id: "t3", account: "cash", kind: "send", title: "Sent to Ledger", detail: "0xa2DF...BB95", date: "2025-03-12", time: "09:30", usd: 250, flow: "out", status: "Completed",
    rows: [{ label: "To", value: "Ledger (0xa2DF...BB95)" }], fee: true, hash: "0xf235ba6305d77dada3267058e6f0e946882a498c4cca85476564e4dd85836c3b" },
  { id: "t4", account: "investments", kind: "swap", title: "ETH to USDC", detail: "Swap", date: "2025-03-11", time: "18:20", usd: 259.75, flow: "swap", status: "Completed",
    rows: [{ label: "Paid", value: "0.1039 ETH" }, { label: "Rate", value: "1 ETH = 2,500.00 USDC" }], fee: true, hash: "0x16c89d4182d61e846e0ddc1b86a9b775a68208161714c388079ebcf0af6da59a" },
  { id: "t5", account: "cash", kind: "withdrawal", title: "USDC Withdrawal", detail: "Revolut ••••1342", date: "2025-03-11", time: "10:07", usd: 1508.5, flow: "out", status: "Completed", rows: [] },
  { id: "t6", account: "card", kind: "card", title: "Uber Eats", detail: "Swissquote Card", date: "2025-03-11", time: "08:45", usd: 24.9, flow: "out", status: "Completed",
    rows: [{ label: "Card", value: "Swissquote Visa ••••4218" }] },
  { id: "t7", account: "earn", kind: "reward", title: "Earn interest", detail: "USDC", date: "2025-03-10", time: "16:05", usd: 45.2, flow: "in", status: "Completed",
    rows: [{ label: "From", value: "Swissquote Earn" }], fee: true, hash: "0xa76a8ecc9e87df0bf233809bcbae165a904d479005ea841e195251a34785f6e6" },
  { id: "t8", account: "cash", kind: "deposit", title: "Bank deposit", detail: "Bridge", date: "2025-03-10", time: "09:12", usd: 2500, flow: "in", status: "Completed",
    rows: [{ label: "From", value: "Bank transfer via Bridge" }, { label: "Payment rail", value: "ACH Same Day" }], fee: true, hash: "0x9673d601b7cf4fd5bce8e3a78d6e89d00eeeabd9a869b0c6eb3b040abe8787e0" },
  { id: "t9", account: "investments", kind: "swap", title: "USDC to AERO", detail: "Swap", date: "2025-03-07", time: "19:30", usd: 100, flow: "swap", crypto: "222.22 AERO", status: "Completed",
    rows: [{ label: "Paid", value: "100.00 USDC" }, { label: "Rate", value: "1 AERO = 0.45 USDC" }], fee: true, hash: "0x8e8175e7dc437f431c4a0943168bd43b7a3322a882e9c4eeeba390b4a3b31336" },
  { id: "t10", account: "card", kind: "card", title: "Spotify", detail: "Swissquote Card", date: "2025-03-07", time: "12:10", usd: 11.99, flow: "out", status: "Completed",
    rows: [{ label: "Card", value: "Swissquote Visa ••••4218" }] },
  { id: "t11", account: "cash", kind: "receive", title: "Received EURC", detail: "0xe73f...9F6f", date: "2025-03-05", time: "14:22", usd: 300, flow: "in", crypto: "258.62 EURC", status: "Completed",
    rows: [{ label: "From", value: "0xe73f...9F6f" }], fee: true, hash: "0xef6cdb796a2bbaa494492d4e082d1829acbf25af99dd955b603d516ea98080e5" },
  { id: "t12", account: "investments", kind: "swap", title: "ETH to cbBTC", detail: "Swap", date: "2025-03-05", time: "08:50", usd: 389.75, flow: "swap", crypto: "0.004585 cbBTC", status: "Completed",
    rows: [{ label: "Paid", value: "0.1559 ETH" }, { label: "Rate", value: "1 cbBTC = 34.00 ETH" }], fee: true, hash: "0x45eb058df66384ee0da3aa8fee80a5a4f6aa25770da35b204d3e05306cdf21b1" },
  { id: "t14", account: "cash", kind: "send", title: "Sent to 0xe73f...9F6f", detail: "Wallet", date: "2025-02-28", time: "17:40", usd: 75, flow: "out", status: "Completed",
    rows: [{ label: "To", value: "0xe73f...9F6f" }], fee: true, hash: "0xaad00ad28baaf98fc258328ff00b294d2fb0a4593a32421151cde4353ca1c6ff" },
  { id: "t13", account: "card", kind: "membership", title: "Swissquote Plus", detail: "Monthly membership", date: "2025-02-28", time: "10:00", usd: 4.99, flow: "out", status: "Completed",
    rows: [{ label: "Plan", value: "Swissquote Plus, monthly" }, { label: "Paid with", value: "Swissquote Visa ••••4218" }] },
  { id: "t15", account: "cash", kind: "deposit", title: "Bank deposit", detail: "Bridge", date: "2025-02-24", time: "13:05", usd: 1200, flow: "in", status: "Completed",
    rows: [{ label: "From", value: "Bank transfer via Bridge" }, { label: "Payment rail", value: "ACH Same Day" }], fee: true, hash: "0xd55ad98c4969c063b5602e374668a5dbc432700295173e67ba7074f2cd8c3805" },
  { id: "t16", account: "card", kind: "card", title: "Whole Foods", detail: "Swissquote Card", date: "2025-02-24", time: "09:20", usd: 63.42, flow: "out", status: "Completed",
    rows: [{ label: "Card", value: "Swissquote Visa ••••4218" }] },
  { id: "t17", account: "earn", kind: "reward", title: "Earn interest", detail: "USDC", date: "2025-02-18", time: "16:05", usd: 43.8, flow: "in", status: "Completed",
    rows: [{ label: "From", value: "Swissquote Earn" }], fee: true, hash: "0x3a25aceb1aed10d0397bd1bff74fda49a577e8283b540bd1712aa5bdd0f48459" },
];

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function dayLabel(iso: string) {
  // Against the real clock: live rows carry this phone's local date, and the mock rows' 2025 dates read as dates.
  const d = new Date();
  const diff = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.parse(iso)) / 86_400_000;
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
