export const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Splits a dollar amount into its whole part (with the dot) and its cents, e.g. ["$23,531.", "00"]. */
export function splitUsd(value: number): [string, string] {
  const [whole, cents] = usd.format(value).split(".");
  return [`${whole}.`, cents];
}

/** A static dollar amount in the house style: whole units in ink, cents in light grey. */
export function Money({ value, centsClassName = "text-[#dcdcdc]" }: { value: number; centsClassName?: string }) {
  const [whole, cents] = splitUsd(value);
  return (
    <span className="tabular-nums">
      {whole}
      <span className={centsClassName}>{cents}</span>
    </span>
  );
}
