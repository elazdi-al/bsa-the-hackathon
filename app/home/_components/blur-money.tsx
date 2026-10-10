"use client";

import { motion } from "motion/react";
import { blurred, reveal, sharp } from "./transitions";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** A dollar amount that types in glyph by glyph, each one sharpening out of a blur. Cents are grey. */
export function BlurMoney({ value, delay, step }: { value: number; delay: number; step: number }) {
  const [whole, cents] = usd.format(value).split(".");
  const glyphs = [...`${whole}.`, ...cents];

  return (
    <span className="tabular-nums">
      <span className="sr-only">{`${whole}.${cents}`}</span>
      <span aria-hidden className="inline-flex">
        {glyphs.map((glyph, i) => (
          <motion.span
            key={i}
            className={i > whole.length ? "inline-block text-[#dcdcdc]" : "inline-block"}
            initial={{ opacity: 0, filter: blurred, y: "0.2em" }}
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
