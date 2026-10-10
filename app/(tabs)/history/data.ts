export type Kind = "receive" | "send" | "swap" | "reward" | "deposit" | "card" | "membership" | "withdrawal";

export type Tx = {
  id: string;
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
  href?: string;
};

/** Mock "now" for the whole app. */
export const now = { date: "2025-03-12", time: "14:00" };


export const transactions: Tx[] = [
  { id: "t1", kind: "card", title: "Blue Bottle Coffee", detail: "Fuse Card", date: "2025-03-12", time: "13:48", usd: 6.5, flow: "out", status: "Pending",
    rows: [{ label: "Merchant", value: "Blue Bottle Coffee" }, { label: "Card", value: "Fuse Visa ••••4218" }] },
  { id: "t2", kind: "receive", title: "Received from toly.sol", detail: "86xC...2MMY", date: "2025-03-12", time: "11:36", usd: 119.51, flow: "in", crypto: "0.92 SOL", status: "Completed",
    rows: [{ label: "From", value: "toly.sol (86xC...2MMY)" }], fee: true, hash: "5Hq2YvT8nWk3LrPz9XcB4mJdA7sEu1fGo6iNtRw2KxVb" },
  { id: "t3", kind: "send", title: "Sent to Solana wallet", detail: "Ledger", date: "2025-03-12", time: "09:30", usd: 250, flow: "out", crypto: "250.00 USDC", status: "Completed",
    rows: [{ label: "To", value: "Solana wallet (Ledger)" }], fee: true, hash: "2Zp7KmQe4VdXr8LwTn3YcBj6AfGs9uHo1iNtRb5WxCvE" },
  { id: "t4", kind: "swap", title: "SOL to USDC", detail: "Swap", date: "2025-03-11", time: "18:20", usd: 259.8, flow: "swap", crypto: "259.80 USDC", status: "Completed",
    rows: [{ label: "Paid", value: "2.00 SOL" }, { label: "Rate", value: "1 SOL = 129.90 USDC" }], fee: true, hash: "4Rk9LmTq2WvXz7NcBe3YdPj8AfGs5uHo6iEtRb1WxCvK" },
  { id: "t5", kind: "withdrawal", title: "USDC Withdrawal", detail: "Revolut ••••1342", date: "2025-03-11", time: "10:07", usd: 1508.5, flow: "out", crypto: "1,508.50 USDC", status: "Completed", rows: [], href: "/transaction-tracking" },
  { id: "t6", kind: "card", title: "Uber Eats", detail: "Fuse Card", date: "2025-03-11", time: "08:45", usd: 24.9, flow: "out", status: "Completed",
    rows: [{ label: "Merchant", value: "Uber Eats" }, { label: "Card", value: "Fuse Visa ••••4218" }] },
  { id: "t7", kind: "reward", title: "Staking reward", detail: "Solana", date: "2025-03-10", time: "16:05", usd: 649.5, flow: "in", crypto: "5.00 SOL", status: "Completed",
    rows: [{ label: "From", value: "Solana staking" }], fee: true, hash: "3Wm8KqTe5VdXr2LwNn7YcBj9AfGs4uHo1iPtRb6WxCvZ" },
  { id: "t8", kind: "deposit", title: "Bank deposit", detail: "Bridge", date: "2025-03-10", time: "09:12", usd: 2500, flow: "in", crypto: "2,500.00 USDC", status: "Completed",
    rows: [{ label: "From", value: "Bank transfer via Bridge" }, { label: "Payment rail", value: "ACH Same Day" }], fee: true, hash: "6Tn3LmQp8WvXz4KcBe9YdRj2AfGs7uHo5iEtNb1WxCvA" },
  { id: "t9", kind: "swap", title: "USDC to JUP", detail: "Swap", date: "2025-03-07", time: "19:30", usd: 100, flow: "swap", crypto: "142.86 JUP", status: "Completed",
    rows: [{ label: "Paid", value: "100.00 USDC" }, { label: "Rate", value: "1 JUP = 0.70 USDC" }], fee: true, hash: "8Ys5KmTq3WvXz9NcBe2YdPj6AfGs1uHo4iRtLb7WxCvQ" },
  { id: "t10", kind: "card", title: "Spotify", detail: "Fuse Card", date: "2025-03-07", time: "12:10", usd: 11.99, flow: "out", status: "Completed",
    rows: [{ label: "Merchant", value: "Spotify" }, { label: "Card", value: "Fuse Visa ••••4218" }] },
  { id: "t11", kind: "receive", title: "Received PYUSD", detail: "9Qk2...vT4n", date: "2025-03-05", time: "14:22", usd: 300, flow: "in", crypto: "300.00 PYUSD", status: "Completed",
    rows: [{ label: "From", value: "9Qk2...vT4n" }], fee: true, hash: "7Vp4LmQe9WkXr3NcBt8YdAj5HfGs2uHo6iEzRb1WxCvM" },
  { id: "t12", kind: "swap", title: "SOL to JTO", detail: "Swap", date: "2025-03-05", time: "08:50", usd: 389.7, flow: "swap", crypto: "203.71 JTO", status: "Completed",
    rows: [{ label: "Paid", value: "3.00 SOL" }, { label: "Rate", value: "1 SOL = 67.91 JTO" }], fee: true, hash: "9Bn6KmTq1WvXz5LcPe4YdRj8AfGs3uHo2iEtNb7WxCvD" },
  { id: "t13", kind: "membership", title: "Fuse Plus", detail: "Monthly membership", date: "2025-02-28", time: "10:00", usd: 4.99, flow: "out", status: "Completed",
    rows: [{ label: "Plan", value: "Fuse Plus, monthly" }, { label: "Paid with", value: "Fuse Visa ••••4218" }] },
  { id: "t14", kind: "send", title: "Sent to 9Qk2...vT4n", detail: "Wallet", date: "2025-02-28", time: "17:40", usd: 75, flow: "out", crypto: "75.00 USDC", status: "Completed",
    rows: [{ label: "To", value: "9Qk2...vT4n" }], fee: true, hash: "1Dp7LmQe3WkXr9NcBt2YdAj6HfGs8uHo4iEzRb5WxCvY" },
  { id: "t15", kind: "deposit", title: "Bank deposit", detail: "Bridge", date: "2025-02-24", time: "13:05", usd: 1200, flow: "in", crypto: "1,200.00 USDC", status: "Completed",
    rows: [{ label: "From", value: "Bank transfer via Bridge" }, { label: "Payment rail", value: "ACH Same Day" }], fee: true, hash: "5Hn2KmTq7WvXz1LcPe8YdRj4AfGs6uHo3iEtNb9WxCvF" },
  { id: "t16", kind: "card", title: "Whole Foods", detail: "Fuse Card", date: "2025-02-24", time: "09:20", usd: 63.42, flow: "out", status: "Completed",
    rows: [{ label: "Merchant", value: "Whole Foods Market" }, { label: "Card", value: "Fuse Visa ••••4218" }] },
  { id: "t17", kind: "reward", title: "Staking reward", detail: "Solana", date: "2025-02-18", time: "16:05", usd: 623.52, flow: "in", crypto: "4.80 SOL", status: "Completed",
    rows: [{ label: "From", value: "Solana staking" }], fee: true, hash: "2Cq8LmTe6WvXr4KcBt1YdPj9AfGs5uHo7iEzNb3WxCvG" },
];

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

export function dayLabel(iso: string) {
  const diff = day(now.date) - day(iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${+iso.slice(8)} ${months[+iso.slice(5, 7) - 1]}`;
}

export function fullDate(t: Tx) {
  return `${+t.date.slice(8)} ${months[+t.date.slice(5, 7) - 1]} ${t.date.slice(0, 4)} at ${t.time}`;
}

export const groups = Object.values(
  transactions.reduce<Record<string, { label: string; items: Tx[] }>>((acc, t) => {
    (acc[t.date] ??= { label: dayLabel(t.date), items: [] }).items.push(t);
    return acc;
  }, {}),
);

const thisMonth = transactions.filter((t) => t.date.startsWith(now.date.slice(0, 7)));
export const summary = {
  month: months[+now.date.slice(5, 7) - 1],
  in: thisMonth.filter((t) => t.flow === "in").reduce((s, t) => s + t.usd, 0),
  out: thisMonth.filter((t) => t.flow === "out").reduce((s, t) => s + t.usd, 0),
};
