"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { usd } from "../../_components/money";
import { RollingMoney } from "../../_components/rolling-money";
import { blurred, reveal, sharp } from "../../_components/transitions";

// The intro reveal plays once per page session, as Home's numbers first become known.
let introDone = false;
export const wasIntroDone = () => introDone;
export const markIntroDone = () => {
  introDone = true;
};

/** A dollar amount that types in glyph by glyph, each one sharpening out of a blur. `centsClassName` restyles the cents, e.g. smaller. */
export function BlurMoney({
  value,
  delay,
  step,
  centsClassName = "",
}: {
  value: number;
  delay: number;
  step: number;
  centsClassName?: string;
}) {
  const [skip] = useState(introDone);
  const [whole, cents] = usd.format(value).split(".");
  const glyphs = [...`${whole}.`, ...cents];

  return (
    <span className="tabular-nums">
      <span className="sr-only">{`${whole}.${cents}`}</span>
      {/* Baseline, not stretch: cents drawn smaller still sit on the line of the whole units. */}
      <span aria-hidden className="inline-flex items-baseline">
        {glyphs.map((glyph, i) => (
          <motion.span
            key={i}
            className={`inline-block ${i > whole.length ? centsClassName : ""}`}
            initial={skip ? false : { opacity: 0, filter: blurred, y: "0.2em" }}
            animate={{ opacity: 1, filter: sharp, y: 0 }}
            transition={{ ...reveal, delay: delay + i * step }}
          >
            {glyph}
          </motion.span>
        ))}
      </span>
    </span>
  );
}

/** An amount not known yet: holds the line's height, so nothing shifts when the number arrives. */
export const MoneyPlaceholder = () => (
  <span aria-hidden className="invisible">
    $0
  </span>
);

/**
 * An amount that types in with BlurMoney once known, then hands every change to RollingMoney, so a refresh,
 * a payment or a scrub rolls the digits instead of replaying the intro.
 */
export function IntroMoney({
  value,
  delay,
  step,
  centsClassName,
}: {
  value: number | undefined;
  delay: number;
  step: number;
  centsClassName?: string;
}) {
  const [first, setFirst] = useState(value);
  const [rolled, setRolled] = useState(false);
  if (first === undefined && value !== undefined) setFirst(value);
  else if (!rolled && value !== undefined && value !== first) setRolled(true);

  if (first === undefined) return <MoneyPlaceholder />;
  return (
    // The rolling layer sits on the same digits from the start, so the first change rolls from them; once it owns
    // the number the typed layer goes, and the cell takes the rolling width.
    <span className="inline-grid">
      {!rolled && (
        <span className="col-start-1 row-start-1">
          <BlurMoney value={first} delay={delay} step={step} centsClassName={centsClassName} />
        </span>
      )}
      <span className={`col-start-1 row-start-1 ${rolled ? "" : "invisible"}`}>
        <RollingMoney value={value ?? first} centsClassName={centsClassName} />
      </span>
    </span>
  );
}
