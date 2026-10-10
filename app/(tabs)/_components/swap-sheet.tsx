"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CoinLogo } from "@/app/coin-breakdown/_components/coin-logos";
import { coins, type CoinId } from "@/app/coin-breakdown/data";
import { CheckIcon, FlipIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { blurred, leave, sharp, snappy } from "./transitions";

type Side = "sol" | "usdc";
const held = (id: CoinId) => coins.find((c) => c.id === id)!;
const sol = held("sol");
const usdc = held("usdc");
const rate = sol.value / sol.amount; // USDC per SOL, ~129.90
const info: Record<Side, { symbol: string; balance: number; price: number }> = {
  sol: { symbol: "SOL", balance: sol.amount, price: rate },
  usdc: { symbol: "USDC", balance: usdc.amount, price: 1 },
};

const fmt = (n: number, max = 2) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: max });
// The label cross-fades through blur, like the Send button's.
const labelSwap = { initial: { opacity: 0, filter: blurred }, animate: { opacity: 1, filter: sharp, transition: snappy }, exit: { opacity: 0, filter: blurred, transition: leave } };

function Token({ side }: { side: Side }) {
  return (
    <span className="flex items-center gap-2 text-[16px] font-semibold">
      <span className="size-7">
        <CoinLogo id={side} />
      </span>
      {info[side].symbol}
    </span>
  );
}

const card = "rounded-[24px] border bg-surface p-4 transition-[border-color,background-color] duration-150 ease-out";

export function SwapSheet({ open, onOpenChange, onClosed }: { open: boolean; onOpenChange: (o: boolean) => void; onClosed: () => void }) {
  const [from, setFrom] = useState<Side>("sol");
  const [text, setText] = useState("");
  const [flips, setFlips] = useState(0);
  const [phase, setPhase] = useState<"idle" | "busy" | "done">("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const to: Side = from === "sol" ? "usdc" : "sol";
  const amount = Number(text) || 0;
  const out = (amount * info[from].price) / info[to].price;
  const over = amount > info[from].balance;
  const disabled = over || amount <= 0;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // Reset once fully closed, so reopening starts clean.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setText("");
      setFrom("sol");
      setPhase("idle");
    }, 400);
    return () => clearTimeout(t);
  }, [open]);

  function flip() {
    setFlips((n) => n + 1);
    setFrom(to);
    setText(out > 0 ? String(Number(out.toFixed(from === "sol" ? 2 : 6))) : "");
  }

  function submit() {
    setPhase("busy");
    timers.current.push(
      setTimeout(() => setPhase("done"), 1200),
      setTimeout(() => onOpenChange(false), 1900),
    );
  }

  const label = over ? `Insufficient ${info[from].symbol}` : phase === "busy" ? "Swapping" : phase === "done" ? "Swapped" : "Swap";
  const rateLine = `1 SOL ≈ ${fmt(rate)} USDC`;

  return (
    <Drawer open={open} onOpenChange={(o) => phase !== "busy" && onOpenChange(o)} dismissible={phase !== "busy"}>
      <DrawerContent
        aria-describedby={undefined}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed();
        }}
        className="pb-[max(20px,env(safe-area-inset-bottom))] tracking-[-0.02em] sm:pb-5"
      >
        <header className="relative flex h-11 shrink-0 items-center justify-center">
          <DrawerTitle>Swap</DrawerTitle>
          <DrawerClose asChild>
            <BackButton kind="close" disabled={phase === "busy"} className="absolute right-4" />
          </DrawerClose>
        </header>

        <div className="overflow-y-auto px-5 pt-3">
          <section className={`${card} has-[input:focus]:border-fuse-blue/40 has-[input:focus]:bg-white`} aria-label="From">
            <div className="flex items-center justify-between text-[14px] text-muted-foreground">
              <span>From</span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">
                  {fmt(info[from].balance)} {info[from].symbol}
                </span>
                <button
                  type="button"
                  onClick={() => setText(String(info[from].balance))}
                  className="grid h-6 place-items-center rounded-full bg-secondary px-2.5 text-[12px] font-semibold text-foreground outline-none transition-[scale,background-color] duration-150 ease-out relative after:absolute after:-inset-x-2 after:-inset-y-2.5 hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.96]"
                >
                  Max
                </button>
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input
                inputMode="decimal"
                aria-label={`Amount of ${info[from].symbol} to swap`}
                placeholder="0"
                autoComplete="off"
                value={text}
                disabled={phase !== "idle"}
                onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setText(e.target.value)}
                className={`min-w-0 flex-1 bg-transparent text-[34px] leading-10 font-bold tracking-[-0.03em] tabular-nums outline-none placeholder:text-cents ${over ? "text-negative" : ""}`}
              />
              <Token side={from} />
            </div>
          </section>

          <div className="relative z-10 -my-4 flex justify-center">
            <motion.button
              type="button"
              aria-label="Flip tokens"
              onClick={flip}
              disabled={phase !== "idle"}
              animate={{ rotate: flips * 180 }}
              whileTap={{ scale: 0.96 }}
              transition={snappy}
              className="grid size-11 place-items-center rounded-full border-4 border-white bg-black text-white outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-35"
            >
              <FlipIcon size={20} />
            </motion.button>
          </div>

          <section className={card} aria-label="To">
            <div className="flex items-center justify-between text-[14px] text-muted-foreground">
              <span>To</span>
              <span className="tabular-nums">
                {fmt(info[to].balance)} {info[to].symbol}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <output className={`min-w-0 flex-1 truncate text-[34px] leading-10 font-bold tracking-[-0.03em] tabular-nums ${amount > 0 ? "" : "text-cents"}`}>
                {amount > 0 ? fmt(out, to === "sol" ? 4 : 2) : "0"}
              </output>
              <Token side={to} />
            </div>
          </section>

          <dl className="mt-4 space-y-1 px-1 text-[15px] leading-5 tracking-[-0.24px]">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Rate</dt>
              <dd className="tabular-nums">
                {from === "sol" ? rateLine : `1 USDC ≈ ${(1 / rate).toFixed(5)} SOL`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Network fee</dt>
              <dd>
                <span className="text-muted-foreground">
                  Fuse
                  <sup aria-hidden className="text-[11px]">
                    +
                  </sup>
                  <span className="sr-only"> Plus</span>
                </span>{" "}
                <span className="text-positive">Covered</span>
              </dd>
            </div>
          </dl>

          <Button
            size="lg"
            onClick={submit}
            disabled={disabled || phase !== "idle"}
            aria-busy={phase === "busy"}
            className={`mt-5 h-14 w-full ${phase !== "idle" ? "disabled:opacity-100" : ""} ${phase === "done" ? "bg-positive hover:bg-positive" : ""}`}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span key={label} className="flex items-center gap-2" {...labelSwap}>
                {phase === "busy" && <Spinner className="size-5" />}
                {phase === "done" && <CheckIcon size={20} />}
                {label}
              </motion.span>
            </AnimatePresence>
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

