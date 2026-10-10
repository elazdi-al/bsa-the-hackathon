/** What the big number is typed in: the token itself, or its dollar value. */
export type Unit = "token" | "usd";
export type Key = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "back";

const MAX_WHOLE_DIGITS = 9;

/** The typed amount after `key`, or null when the key can't apply (nothing to delete, too many digits). */
export function press(text: string, key: Key, decimals: number): string | null {
  if (key === "back") return text ? text.slice(0, -1) : null;
  const [whole, fraction] = text.split(".");
  if (key === ".") return fraction === undefined ? `${whole || "0"}.` : null;
  if (fraction !== undefined) return fraction.length < decimals ? text + key : null;
  if (whole === "0") return key === "0" ? null : key;
  return whole.length < MAX_WHOLE_DIGITS ? text + key : null;
}

/** A typed amount with thousands separators, keeping a trailing dot or zeros as typed: "1234.50" → "1,234.50". */
export function grouped(text: string) {
  const [whole, fraction] = text.split(".");
  const int = Number(whole || 0).toLocaleString("en-US");
  return fraction === undefined ? int : `${int}.${fraction}`;
}

/** A computed amount as the numpad would have typed it; empty when it rounds to nothing. */
export function typed(n: number, decimals: number) {
  const rounded = Number(n.toFixed(decimals));
  return rounded > 0 ? String(rounded) : "";
}

/** The typed amount in tokens and dollars, and what it buys of a token priced `toPrice`. */
export function quote(text: string, unit: Unit, fromPrice: number, toPrice: number) {
  const n = Number(text) || 0;
  const tokens = unit === "token" ? n : n / fromPrice;
  const usd = tokens * fromPrice;
  return { tokens, usd, out: usd / toPrice };
}
