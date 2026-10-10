"use client";

import { ArrowSquareDownRightIcon, ArrowSquareUpRightIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { balance, defaultRange, history, ranges, series, type Range } from "../data";
import { Money, usd } from "../../_components/money";
import { BlurMoney, markIntroDone, wasIntroDone } from "./blur-money";
import { smooth, snappy } from "../../_components/transitions";

export function BalanceChart() {
  const [range, setRange] = useState<Range>(defaultRange);
  // The first rise waits for the balance to start typing; later range switches and later Home visits respond at once.
  const [switched, setSwitched] = useState(false);
  const [revisit] = useState(wasIntroDone);
  const startDelay = switched || revisit ? 0 : 0.35;

  // Index of the bar being scrubbed, or null when showing the total.
  const [active, setActive] = useState<number | null>(null);
  const pointer = useRef<{ id: number; touch: boolean; bar?: number } | null>(null);

  // The chart height changes per breakpoint, so the 2px floor of a bar is measured, not assumed.
  const chart = useRef<HTMLDivElement>(null);
  const [dot, setDot] = useState<number>();

  useEffect(() => {
    const el = chart.current!;
    const observer = new ResizeObserver(() => setDot(2 / el.clientHeight));
    observer.observe(el);
    markIntroDone();
    return () => observer.disconnect();
  }, []);

  const { values, dates } = history[range];
  const last = values.length - 1;
  const shown = active ?? last;
  const scrubbing = active !== null;
  // Always the change since the first bar of the range, so releasing a scrub lands on the same meaning.
  const change = ((values[shown] - values[0]) / values[0]) * 100;
  const up = change >= 0;
  const Arrow = up ? ArrowSquareUpRightIcon : ArrowSquareDownRightIcon;

  function scrubTo(e: PointerEvent) {
    const rect = chart.current!.getBoundingClientRect();
    const t = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const bar = Math.round(t * last);
    const p = pointer.current!;
    // A tick per bar under the finger, like a detent.
    if (p.touch && bar !== p.bar) navigator.vibrate?.(1);
    p.bar = bar;
    setActive(bar);
  }

  function release(e: PointerEvent) {
    if (e.pointerId !== pointer.current?.id) return;
    pointer.current = null;
    setActive(null);
  }

  function onKeyDown(e: KeyboardEvent) {
    const next = {
      ArrowLeft: shown - 1,
      ArrowRight: shown + 1,
      Home: 0,
      End: last,
      Escape: null,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setActive(next === null ? null : Math.min(Math.max(next, 0), last));
  }

  return (
    <section aria-labelledby="total-balance">
      <div className="mt-6 flex items-center gap-2.5 text-[15px] leading-5">
        {/* Every label of the range shares one cell, so the cell is as wide as the widest and the badge never slides. */}
        <h2 id="total-balance" className="grid min-w-28 text-[#adadad] tabular-nums">
          <span className={`col-start-1 row-start-1 ${scrubbing ? "invisible" : ""}`}>Total Balance</span>
          {dates.map((date, i) => (
            <span key={i} aria-hidden className={`col-start-1 row-start-1 whitespace-nowrap ${i === active ? "" : "invisible"}`}>
              {date}
            </span>
          ))}
        </h2>
        <p className={`flex items-center gap-1 text-[14px] font-medium tabular-nums ${up ? "text-positive" : "text-negative"}`}>
          <Arrow weight="fill" size={17} aria-hidden />
          <span className="sr-only">{up ? "Up" : "Down"}</span>
          {Math.abs(change).toFixed(2)}%
        </p>
      </div>

      {/* BlurMoney stays mounted so its type-in never replays; the scrubbed amount sits over it in the same cell. */}
      <p className="mt-1.5 grid text-[42px] leading-12 font-bold tracking-[-0.025em]">
        <span className={`col-start-1 row-start-1 ${scrubbing ? "invisible" : ""}`}>
          <BlurMoney value={balance.total} delay={0.2} step={0.065} />
        </span>
        <span aria-hidden className={`col-start-1 row-start-1 ${scrubbing ? "" : "invisible"}`}>
          <Money value={values[shown]} />
        </span>
      </p>

      <div
        ref={chart}
        role="slider"
        tabIndex={0}
        aria-label={`Balance history, ${range}`}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={shown}
        aria-valuetext={`${dates[shown]}, ${usd.format(values[shown])}`}
        onPointerDown={(e) => {
          if (pointer.current !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
          pointer.current = { id: e.pointerId, touch: e.pointerType === "touch" };
          e.currentTarget.setPointerCapture(e.pointerId);
          scrubTo(e);
        }}
        onPointerMove={(e) => e.pointerId === pointer.current?.id && scrubTo(e)}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        className="mt-4 flex h-22 touch-pan-y items-end justify-between rounded-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-4 md:h-28 lg:h-44"
      >
        {dot !== undefined &&
          series[range].map((height, i) => (
            <motion.span
              key={i}
              className={`h-full w-0.5 origin-bottom rounded-full transition-colors duration-100 md:w-1 ${
                i === active ? "bg-black" : active !== null && i > active ? "bg-[#f0f0f0]" : "bg-[#dcdcdc]"
              }`}
              initial={revisit ? false : { scaleY: dot }}
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
