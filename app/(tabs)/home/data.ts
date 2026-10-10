export const balance = { total: 23531 };

export const ranges = ["1D", "1W", "1M", "6M", "1Y"] as const;
export type Range = (typeof ranges)[number];
export const defaultRange: Range = "6M";

// Bar heights in percent of the chart height, 53 bars per range. 6M is traced from the reference.
export const series: Record<Range, number[]> = {
  "1D": [46, 67, 60, 63, 76, 76, 75, 85, 86, 83, 86, 84, 86, 74, 73, 76, 72, 57, 64, 56, 61, 55, 39, 43, 48, 42, 41, 39, 46, 47, 39, 41, 53, 48, 49, 56, 63, 65, 81, 79, 86, 92, 80, 86, 93, 93, 92, 87, 99, 81, 84, 81, 83],
  "1W": [38, 34, 31, 38, 39, 42, 44, 43, 47, 47, 39, 50, 40, 46, 40, 39, 36, 37, 41, 47, 40, 48, 43, 53, 52, 55, 60, 70, 73, 61, 74, 61, 66, 61, 58, 73, 57, 63, 53, 58, 60, 53, 68, 70, 73, 76, 80, 81, 76, 74, 81, 81, 81],
  "1M": [72, 63, 70, 63, 64, 54, 64, 50, 50, 58, 42, 47, 37, 52, 46, 50, 33, 48, 35, 49, 41, 43, 36, 36, 36, 43, 35, 49, 49, 50, 48, 41, 44, 61, 48, 60, 66, 73, 90, 92, 97, 99, 97, 94, 93, 96, 90, 95, 98, 94, 97, 92, 100],
  "6M": [2, 28, 31, 7, 15, 13, 7, 20, 26, 35, 43, 57, 63, 60, 34, 16, 16, 19, 13, 15, 12, 22, 13, 29, 29, 27, 10, 25, 34, 30, 16, 10, 28, 35, 46, 71, 67, 64, 72, 75, 72, 75, 75, 83, 84, 87, 93, 94, 93, 93, 94, 99, 100],
  "1Y": [14, 16, 9, 16, 11, 7, 10, 22, 23, 17, 22, 23, 11, 20, 11, 19, 21, 25, 30, 22, 18, 24, 20, 31, 29, 32, 32, 38, 33, 41, 30, 37, 43, 39, 50, 44, 46, 55, 53, 49, 64, 68, 72, 74, 73, 80, 66, 82, 82, 87, 93, 81, 85],
};

// The mock "now" for the whole app (UTC, so server and client format identically).
export const now = Date.UTC(2025, 2, 12, 14, 0);

const day = 86_400_000;
const spans: Record<Range, number> = { "1D": day, "1W": 7 * day, "1M": 30 * day, "6M": 182 * day, "1Y": 365 * day };
// How far the balance swings below the total at the lowest bar, as a fraction of the total.
const spreads: Record<Range, number> = { "1D": 0.03, "1W": 0.08, "1M": 0.15, "6M": 0.3, "1Y": 0.45 };
const dateOptions: Record<Range, Intl.DateTimeFormatOptions> = {
  "1D": { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
  "1W": { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
  "1M": { day: "numeric", month: "short" },
  "6M": { day: "numeric", month: "short" },
  "1Y": { day: "numeric", month: "short", year: "numeric" },
};

const entries = ranges.map((r) => {
  const bars = series[r];
  const last = bars.length - 1;
  const fmt = new Intl.DateTimeFormat("en-GB", { ...dateOptions[r], timeZone: "UTC" });
  return [
    r,
    {
      // The last bar is exactly the total; earlier bars scale with their height.
      values: bars.map((h, i) =>
        i === last ? balance.total : Math.round(balance.total * (1 + (spreads[r] * (h - bars[last])) / 100) * 100) / 100,
      ),
      // en-GB abbreviates September as "Sept"; keep every month three letters.
      dates: bars.map((_, i) => fmt.format(now - (spans[r] * (last - i)) / last).replace("Sept", "Sep")),
    },
  ] as const;
});

/** Per range, the balance and the date label of every bar. */
export const history = Object.fromEntries(entries) as Record<Range, { values: number[]; dates: string[] }>;

export type TileId = "cash" | "investments" | "earn" | "card";
/** A tile either pushes its own screen or opens an account sheet that says what the account is. */
export type Tile = { id: TileId; label: string; value: number } & ({ href: string } | { about: string });

export const tiles: Tile[] = [
  { id: "cash", label: "Cash", value: 5000, about: "USDC & PYUSD you can spend or send" },
  { id: "investments", label: "Investments", value: 7531, href: "/coin-breakdown" },
  { id: "earn", label: "Earn", value: 10000, about: "Earning up to 5.45% APY" },
  { id: "card", label: "Card", value: 1000, about: "Your Fuse virtual Visa" },
];

export type Promo = { id: "fuse-plus" | "earn"; title: [string, string] } & ({ href: string } | { account: TileId });

export const promos: Promo[] = [
  { id: "fuse-plus", title: ["Welcome to", "Fuse Plus"], href: "/fuse-plus" },
  { id: "earn", title: ["Earn up to", "5.45% APY"], account: "earn" },
];

export const promoInterval = 3200;

export type Kind = "receive" | "send" | "swap" | "reward" | "deposit" | "card" | "membership" | "withdrawal";

export type Tx = {
  id: string;
  account: TileId;
  kind: Kind;
  title: string;
  /** Detail after the day in the row subtitle. */
  detail: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** Fiat value in USD. */
  usd: number;
  /** "in" is green with +, "out" is ink with −, "swap" is unsigned. */
  flow: "in" | "out" | "swap";
  /** Secondary line under the fiat value. */
  crypto?: string;
  status: "Completed" | "Pending";
};

/** Recent activity in the account sheets. */
export const transactions: Tx[] = [
  { id: "t1", account: "card", kind: "card", title: "Blue Bottle Coffee", detail: "Fuse Card", date: "2025-03-12", usd: 6.5, flow: "out", status: "Pending" },
  { id: "t2", account: "investments", kind: "receive", title: "Received from toly.sol", detail: "86xC...2MMY", date: "2025-03-12", usd: 119.51, flow: "in", crypto: "0.92 SOL", status: "Completed" },
  { id: "t3", account: "cash", kind: "send", title: "Sent to Solana wallet", detail: "Ledger", date: "2025-03-12", usd: 250, flow: "out", crypto: "250.00 USDC", status: "Completed" },
  { id: "t4", account: "investments", kind: "swap", title: "SOL to USDC", detail: "Swap", date: "2025-03-11", usd: 259.8, flow: "swap", crypto: "259.80 USDC", status: "Completed" },
  { id: "t5", account: "cash", kind: "withdrawal", title: "USDC Withdrawal", detail: "Revolut ••••1342", date: "2025-03-11", usd: 1508.5, flow: "out", crypto: "1,508.50 USDC", status: "Completed" },
  { id: "t6", account: "card", kind: "card", title: "Uber Eats", detail: "Fuse Card", date: "2025-03-11", usd: 24.9, flow: "out", status: "Completed" },
  { id: "t7", account: "earn", kind: "reward", title: "Staking reward", detail: "Solana", date: "2025-03-10", usd: 649.5, flow: "in", crypto: "5.00 SOL", status: "Completed" },
  { id: "t8", account: "cash", kind: "deposit", title: "Bank deposit", detail: "Bridge", date: "2025-03-10", usd: 2500, flow: "in", crypto: "2,500.00 USDC", status: "Completed" },
  { id: "t9", account: "investments", kind: "swap", title: "USDC to JUP", detail: "Swap", date: "2025-03-07", usd: 100, flow: "swap", crypto: "142.86 JUP", status: "Completed" },
  { id: "t10", account: "card", kind: "card", title: "Spotify", detail: "Fuse Card", date: "2025-03-07", usd: 11.99, flow: "out", status: "Completed" },
  { id: "t11", account: "cash", kind: "receive", title: "Received PYUSD", detail: "9Qk2...vT4n", date: "2025-03-05", usd: 300, flow: "in", crypto: "300.00 PYUSD", status: "Completed" },
  { id: "t12", account: "investments", kind: "swap", title: "SOL to JTO", detail: "Swap", date: "2025-03-05", usd: 389.7, flow: "swap", crypto: "203.71 JTO", status: "Completed" },
  { id: "t13", account: "card", kind: "membership", title: "Fuse Plus", detail: "Monthly membership", date: "2025-02-28", usd: 4.99, flow: "out", status: "Completed" },
  { id: "t14", account: "cash", kind: "send", title: "Sent to 9Qk2...vT4n", detail: "Wallet", date: "2025-02-28", usd: 75, flow: "out", crypto: "75.00 USDC", status: "Completed" },
  { id: "t15", account: "cash", kind: "deposit", title: "Bank deposit", detail: "Bridge", date: "2025-02-24", usd: 1200, flow: "in", crypto: "1,200.00 USDC", status: "Completed" },
  { id: "t16", account: "card", kind: "card", title: "Whole Foods", detail: "Fuse Card", date: "2025-02-24", usd: 63.42, flow: "out", status: "Completed" },
  { id: "t17", account: "earn", kind: "reward", title: "Staking reward", detail: "Solana", date: "2025-02-18", usd: 623.52, flow: "in", crypto: "4.80 SOL", status: "Completed" },
];

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

export function dayLabel(iso: string) {
  const diff = Math.floor(now / day) - Date.parse(iso) / day;
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return dayFmt.format(Date.parse(iso));
}
