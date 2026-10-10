"use client";

import { ArrowSquareUpRightIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { balance, defaultRange, ranges, series, type Range } from "../data";
import { BlurMoney } from "./blur-money";
import { smooth, snappy } from "../../_components/transitions";

export function BalanceChart() {
  const [range, setRange] = useState<Range>(defaultRange);
  // The first rise waits for the balance to start typing; later range switches respond at once.
  const [switched, setSwitched] = useState(false);
  const startDelay = switched ? 0 : 0.35;

  // The chart height changes per breakpoint, so the 2px floor of a bar is measured, not assumed.
  const chart = useRef<HTMLDivElement>(null);
  const [dot, setDot] = useState<number>();

  useEffect(() => {
    const el = chart.current!;
    const observer = new ResizeObserver(() => setDot(2 / el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
        ref={chart}
        role="img"
        aria-label={`Balance history, ${range}`}
        className="mt-4 flex h-22 items-end justify-between md:h-28 lg:h-44"
      >
        {dot !== undefined &&
          series[range].map((height, i) => (
            <motion.span
              key={i}
              className="h-full w-0.5 origin-bottom rounded-full bg-[#dcdcdc] md:w-1"
              initial={{ scaleY: dot }}
              animate={{ scaleY: Math.max(height / 100, dot) }}
              transition={{ ...smooth, delay: startDelay + i * (switched ? 0.004 : 0.007) }}
            />
          ))}
      </div>

      <ToggleGroup
        aria-label="Chart range"
        value={[range]}
        onValueChange={([next]) => {
          if (!next) return;
          setRange(next as Range);
          setSwitched(true);
        }}
        className="mx-auto mt-1 gap-0"
      >
        {ranges.map((r) => (
          <ToggleGroupItem
            key={r}
            value={r}
            className="relative h-11 w-12 rounded-full text-[13px] font-semibold text-[#bcbcbc] transition-[color,scale] duration-150 hover:bg-transparent hover:text-[#bcbcbc] focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-inset active:scale-[0.96] aria-pressed:bg-transparent aria-pressed:text-black"
          >
            {r === range && (
              <motion.span
                layoutId="range-pill"
                transition={snappy}
                className="absolute inset-x-[3px] inset-y-[11px] rounded-full bg-[#f2f2f2]"
              />
            )}
            <span className="relative z-10">{r}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </section>
  );
}
