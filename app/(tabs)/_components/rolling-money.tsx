"use client";

import { AnimatePresence, motion } from "motion/react";
import { usd } from "./money";
import { leave, snappy } from "./transitions";

/** A dollar amount whose digits roll like an odometer as the value changes. Cents are grey. */
export function RollingMoney({ value }: { value: number }) {
  const [whole, cents] = usd.format(value).split(".");
  // Keyed by place from the right, so $9,999 -> $10,000 rolls every existing column and only the new leading glyphs enter.
  const glyphs = [
    ...[...whole].map((glyph, i) => ({ key: glyph === "$" ? glyph : `${whole.length - i}`, glyph, cents: false })),
    { key: ".", glyph: ".", cents: false },
    ...[...cents].map((glyph, i) => ({ key: `c${i}`, glyph, cents: true })),
  ];

  return (
    <span className="tabular-nums">
      <span className="sr-only">{usd.format(value)}</span>
      <span aria-hidden className="relative inline-flex">
        <AnimatePresence initial={false} mode="popLayout">
          {glyphs.map(({ key, glyph, cents }) => (
            <motion.span
              key={key}
              layout="position"
              className={cents ? "text-cents" : undefined}
              initial={{ opacity: 0, y: "0.25em" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "0.25em", transition: leave }}
              transition={snappy}
            >
              {/\d/.test(glyph) ? <Digit value={+glyph} /> : glyph}
            </motion.span>
          ))}
        </AnimatePresence>
      </span>
    </span>
  );
}

function Digit({ value }: { value: number }) {
  return (
    <span className="block h-[1lh] overflow-hidden mask-y-from-85%">
      <motion.span className="flex flex-col" initial={false} animate={{ y: `${-value * 10}%` }} transition={snappy}>
        {[...Array(10).keys()].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </motion.span>
    </span>
  );
}
