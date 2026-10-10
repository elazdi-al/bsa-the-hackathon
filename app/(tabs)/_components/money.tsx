export const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** A static dollar amount in the house style: one ink, digits of equal width. */
export function Money({ value }: { value: number }) {
  return <span className="tabular-nums">{usd.format(value)}</span>;
}
