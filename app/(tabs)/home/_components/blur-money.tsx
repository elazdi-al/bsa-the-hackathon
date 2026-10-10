"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { usd } from "../../_components/money";
import { blurred, reveal, sharp } from "../../_components/transitions";

// The intro reveal plays on the first Home mount of the page session only.
let introDone = false;
export const wasIntroDone = () => introDone;
export const markIntroDone = () => {
  introDone = true;
};

/** A dollar amount that types in glyph by glyph, each one sharpening out of a blur. Cents are grey. */
export function BlurMoney({ value, delay, step }: { value: number; delay: number; step: number }) {
  const [skip] = useState(introDone);
  const [whole, cents] = usd.format(value).split(".");
  const glyphs = [...`${whole}.`, ...cents];

  return (
    <span className="tabular-nums">
      <span className="sr-only">{`${whole}.${cents}`}</span>
      <span aria-hidden className="inline-flex">
        {glyphs.map((glyph, i) => (
          <motion.span
            key={i}
            className={i > whole.length ? "inline-block text-cents" : "inline-block"}
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
