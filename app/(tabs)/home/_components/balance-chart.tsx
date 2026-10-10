"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { TrendUpIcon } from "@/components/icons";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { balance, defaultRange, history, ranges, series, type Range } from "../data";
import { usd } from "../../_components/money";
import { RollingMoney } from "../../_components/rolling-money";
import { BlurMoney, markIntroDone, wasIntroDone } from "./blur-money";
import { smooth, snappy } from "../../_components/transitions";

const cents = "text-[0.74em] text-cents";

export function BalanceChart() {
  const [range, setRange] = useState<Range>(defaultRange);
  // The first rise waits for the balance to start typing; later range switches and later Home visits respond at once.
  const [switched, setSwitched] = useState(false);
  const [revisit] = useState(wasIntroDone);
  const startDelay = switched || revisit ? 0 : 0.35;

  // Index of the bar being scrubbed, or null when showing the total.
  const [active, setActive] = useState<number | null>(null);
  const pointer = useRef<{ id: number; touch: boolean; bar?: number } | null>(null);
  const [rolled, setRolled] = useState(false);
  const chart = useRef<HTMLDivElement>(null);
  // The layout's MotionConfig stills transforms only; bars grow by height, so they are stilled here.
  const still = useReducedMotion();

  useEffect(markIntroDone, []);

  const { values, dates } = history[range];
  const last = values.length - 1;
  const shown = active ?? last;
  const scrubbing = active !== null;
  // Once scrubbed, the rolling amount keeps the number so a release rolls back to the total instead of swapping layers.
  if (scrubbing && !rolled) setRolled(true);
  // Always the change since the first bar of the range, so releasing a scrub lands on the same meaning.
  const change = ((values[shown] - values[0]) / values[0]) * 100;
  const up = change >= 0;

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
      {/* Label and change meet on the balance's centre line, so neither slides when the label becomes a date or the range changes. */}
      <div className="mt-8 grid grid-cols-2 items-center gap-1.5 text-body tabular-nums">
        <h2 id="total-balance" className="justify-self-end whitespace-nowrap text-muted-foreground">
          {scrubbing ? <span aria-hidden>{dates[shown]}</span> : "Total balance"}
        </h2>
        {/* A quarter turn makes the up-right arrow the down-right one, so crossing zero turns it instead of swapping glyphs. */}
        <p className={`flex items-center gap-0.5 justify-self-start font-semibold transition-[color] duration-200 ease-out ${up ? "text-positive" : "text-negative"}`}>
          <motion.span aria-hidden className="flex" initial={false} animate={{ rotate: up ? 0 : 90 }} transition={snappy}>
            <TrendUpIcon size={16} />
          </motion.span>
          {up ? "+" : "−"}
          {Math.abs(change).toFixed(2)}%
        </p>
      </div>

      {/* BlurMoney types the total in; from the first scrub on, the rolling amount in the same cell owns the number. */}
      <p className="mt-2 grid justify-items-center text-display">
        <span className={`col-start-1 row-start-1 ${rolled ? "invisible" : ""}`}>
          <BlurMoney value={balance.total} delay={0.2} step={0.065} centsClassName={cents} />
        </span>
        <span className={`col-start-1 row-start-1 ${rolled ? "" : "invisible"}`}>
          <RollingMoney value={values[shown]} centsClassName={cents} />
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
        className="mt-8 flex h-32 touch-pan-y items-end gap-0.5 rounded-sm outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 md:h-36 md:gap-1 lg:h-56"
      >
        {/* Height, not scaleY: a scaled pill squashes its rounded top. */}
        {series[range].map((height, i) => (
          <motion.span
            key={i}
            className={`min-h-0.5 flex-1 rounded-full transition-[opacity] duration-100 ${
              i === active ? "bg-fuse-blue" : "bg-linear-to-b from-fuse-blue/45 to-fuse-blue/10"
            } ${active !== null && i > active ? "opacity-20" : ""}`}
            initial={revisit ? false : { height: "0%" }}
            animate={{ height: `${height}%` }}
            transition={still ? { duration: 0 } : { ...smooth, delay: startDelay + i * (switched ? 0.004 : 0.007) }}
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
        className="mx-auto mt-3 gap-0"
      >
        {ranges.map((r) => (
          <ToggleGroupItem
            key={r}
            value={r}
            className="relative h-11 w-12 rounded-full text-muted-foreground hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-pressed:bg-transparent aria-pressed:text-foreground"
          >
            {r === range && (
              <motion.span layoutId="range-pill" transition={snappy} className="absolute inset-x-0 inset-y-1.5 rounded-full bg-secondary" />
            )}
            {/* The size sits on the label: the item's class merge would drop it beside a text colour. */}
            <span className="relative z-10 text-caption font-semibold">{r}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </section>
  );
}
