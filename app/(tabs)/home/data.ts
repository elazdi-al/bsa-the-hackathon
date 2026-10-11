export const ranges = ["1D", "1W", "1M", "6M", "1Y"] as const;
export type Range = (typeof ranges)[number];
export const defaultRange: Range = "6M";

/** Bars per range in the balance chart. */
export const BARS = 53;

const day = 86_400_000;
const spans: Record<Range, number> = { "1D": day, "1W": 7 * day, "1M": 30 * day, "6M": 182 * day, "1Y": 365 * day };
const dateOptions: Record<Range, Intl.DateTimeFormatOptions> = {
  "1D": { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
  "1W": { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
  "1M": { day: "numeric", month: "short" },
  "6M": { day: "numeric", month: "short" },
  "1Y": { day: "numeric", month: "short", year: "numeric" },
};

/**
 * Per range, the balance, height and date label of every bar, ending on `total` at `now` in this phone's time zone.
 * `balanceAt` is the wallet's balance at a moment.
 */
export function historyFor(total: number, now: number, balanceAt: (time: number) => number) {
  const last = BARS - 1;
  const entries = ranges.map((r) => {
    const fmt = new Intl.DateTimeFormat("en-GB", dateOptions[r]);
    const at = (i: number) => now - (spans[r] * (last - i)) / last;
    const bars = Array.from({ length: BARS }, (_, i) => i);
    const values = bars.map((i) => (i === last ? total : balanceAt(at(i))));
    const peak = Math.max(...values);
    return [
      r,
      {
        values,
        heights: values.map((v) => (peak > 0 ? (v / peak) * 100 : 0)),
        // en-GB abbreviates September as "Sept"; keep every month three letters.
        dates: bars.map((i) => fmt.format(at(i)).replace("Sept", "Sep")),
      },
    ] as const;
  });
  return Object.fromEntries(entries) as Record<Range, { values: number[]; heights: number[]; dates: string[] }>;
}

export type TileId = "cash" | "investments" | "earn" | "card";
/** A tile either pushes its own screen or opens an account sheet that says what the account is. `value` is undefined until known. */
export type Tile = { id: TileId; label: string; value: number | undefined; demo?: true } & ({ href: string } | { about: string });

export const tiles: Tile[] = [
  { id: "cash", label: "Cash", value: undefined, about: "USDC you can spend or send" },
  { id: "investments", label: "Investments", value: undefined, href: "/coin-breakdown", demo: true },
  { id: "earn", label: "Earn", value: undefined, about: "Interest on your USDC", demo: true },
  { id: "card", label: "Card", value: undefined, about: "A virtual Visa card for your USDC", demo: true },
];

/** The sum of the tiles, or undefined while any of them isn't known yet. */
export const totalOf = (tiles: Tile[]) =>
  tiles.reduce<number | undefined>((sum, t) => (sum === undefined || t.value === undefined ? undefined : sum + t.value), 0);

/** `member`: the title instead, once the client has Swissquote Plus. */
export type Promo = { id: "plus" | "earn"; title: [string, string]; member?: [string, string]; demo?: true } & ({ href: string } | { account: TileId });

export const promos: Promo[] = [
  { id: "plus", title: ["Get more with", "Swissquote Plus"], member: ["Welcome to", "Swissquote Plus"], href: "/plus" },
  { id: "earn", title: ["Earn interest on", "your USDC"], account: "earn", demo: true },
];

export const promoInterval = 3200;
