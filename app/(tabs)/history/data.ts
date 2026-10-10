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

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function dayLabel(iso: string) {
  // Rows carry this phone's local date, so today is read off the local clock too.
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
