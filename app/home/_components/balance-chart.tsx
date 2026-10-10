"use client";

import { ArrowSquareUpRightIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useState } from "react";
import { balance, defaultRange, ranges, series, type Range } from "../data";
import { BlurMoney } from "./blur-money";
import { smooth, snappy } from "./transitions";

const chartHeight = 88;
const dot = 2 / chartHeight;

export function BalanceChart() {
  const [range, setRange] = useState<Range>(defaultRange);
  // The first rise waits for the balance to start typing; later range switches respond at once.
  const [switched, setSwitched] = useState(false);
  const startDelay = switched ? 0 : 0.35;

  return (
    <section aria-labelledby="total-balance">
      <div className="mt-6 flex items-center gap-2.5 text-[15px] leading-5">
        <h2 id="total-balance" className="text-[#adadad]">
          Total Balance
        </h2>
        <p className="flex items-center gap-1 text-[14px] font-medium text-[#3dd55e] tabular-nums">
          <ArrowSquareUpRightIcon weight="fill" size={17} aria-hidden />
          <span className="sr-only">Up</span>
          {balance.change}%
        </p>
      </div>

      <p className="mt-1.5 text-[42px] leading-12 font-bold tracking-[-0.025em]">
        <BlurMoney value={balance.total} delay={0.2} step={0.065} />
      </p>

      <div
        role="img"
        aria-label={`Balance history, ${range}`}
        className="mt-4 flex items-end justify-between"
        style={{ height: chartHeight }}
      >
        {series[range].map((height, i) => (
          <motion.span
            key={i}
            className="h-full w-0.5 origin-bottom rounded-full bg-[#dcdcdc]"
            initial={{ scaleY: dot }}
            animate={{ scaleY: Math.max(height / 100, dot) }}
            transition={{ ...smooth, delay: startDelay + i * (switched ? 0.004 : 0.007) }}
          />
        ))}
      </div>

      <div role="group" aria-label="Chart range" className="mt-1 flex justify-center">
        {ranges.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={r === range}
            onClick={() => {
              setRange(r);
              setSwitched(true);
            }}
            className={`relative grid h-11 w-12 place-items-center rounded-full text-[13px] font-semibold transition-[color,scale] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-inset active:scale-[0.96] ${
              r === range ? "text-black" : "text-[#bcbcbc]"
            }`}
          >
            {r === range && (
              <motion.span
                layoutId="range-pill"
                transition={snappy}
                className="absolute inset-x-[3px] inset-y-[11px] rounded-full bg-[#f2f2f2]"
              />
            )}
            <span className="relative z-10">{r}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
