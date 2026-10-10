"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { TrendUpIcon } from "@/components/icons";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { defaultRange, historyFor, ranges, series, totalOf, type Range } from "../data";
import { usd } from "../../_components/money";
import { useTiles } from "./accounts";
import { IntroMoney, markIntroDone, wasIntroDone } from "./blur-money";
import { smooth, snappy } from "../../_components/transitions";

const cents = "text-[0.74em]";

export function BalanceChart() {
  const [range, setRange] = useState<Range>(defaultRange);
  // The first rise waits for the balance to start typing; later range switches and later Home visits respond at once.
  const [switched, setSwitched] = useState(false);
  const [revisit] = useState(wasIntroDone);
  const startDelay = switched || revisit ? 0 : 0.35;

  // Index of the bar being scrubbed, or null when showing the total.
  const [active, setActive] = useState<number | null>(null);
  const pointer = useRef<{ id: number; touch: boolean; bar?: number } | null>(null);
  const chart = useRef<HTMLDivElement>(null);
  // The layout's MotionConfig stills transforms only; bars grow by height, so they are stilled here.
  const still = useReducedMotion();

  const total = totalOf(useTiles());
  // Client only: the server renders the wallet as loading, so the dates never meet the server's clock.
  const history = useMemo(() => (total === undefined ? undefined : historyFor(total, Date.now())), [total]);
  // Done once Home's numbers are known, not at mount: the wallet's Cash arrives after.
  useEffect(() => {
    if (total !== undefined) markIntroDone();
  }, [total]);

  const data = history?.[range];
  const last = series[range].length - 1;
  const shown = active ?? last;
  const scrubbing = active !== null;
  // Always the change since the first bar of the range, so releasing a scrub lands on the same meaning.
  const change = data ? ((data.values[shown] - data.values[0]) / data.values[0]) * 100 : 0;
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
    if (!data) return;
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
          {scrubbing ? <span aria-hidden>{data?.dates[shown]}</span> : "Total balance"}
        </h2>
        {/* A quarter turn makes the up-right arrow the down-right one, so crossing zero turns it instead of swapping glyphs. */}
        <p className={`flex items-center gap-0.5 justify-self-start font-semibold transition-[color] duration-200 ease-out ${up ? "text-positive" : "text-negative"} ${data ? "" : "invisible"}`}>
          <motion.span aria-hidden className="flex" initial={false} animate={{ rotate: up ? 0 : 90 }} transition={snappy}>
            <TrendUpIcon size={16} />
          </motion.span>
          {up ? "+" : "−"}
          {Math.abs(change).toFixed(2)}%
        </p>
      </div>

      <p className="mt-2 grid justify-items-center text-display">
        <IntroMoney value={data?.values[shown]} delay={0.2} step={0.065} centsClassName={cents} />
      </p>

      <div
        ref={chart}
        role="slider"
        tabIndex={0}
        aria-label={`Balance history, ${range}`}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={shown}
        aria-valuetext={data && `${data.dates[shown]}, ${usd.format(data.values[shown])}`}
        onPointerDown={(e) => {
          if (!data || pointer.current !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
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
              i === active ? "bg-brand" : "bg-linear-to-b from-brand/45 to-brand/10"
            } ${active !== null && i > active ? "opacity-20" : ""}`}
            initial={revisit ? false : { height: "0%" }}
            animate={{ height: data ? `${height}%` : "0%" }}
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
