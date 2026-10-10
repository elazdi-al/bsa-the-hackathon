"use client";

import { ApproximateEqualsIcon, ArrowsDownUpIcon, CaretDownIcon, CheckIcon, ScanSmileyIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useAnimate, useReducedMotion, type Variants } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { CoinLogo } from "@/app/coin-breakdown/_components/coin-logos";
import { coins } from "@/app/coin-breakdown/data";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { grouped, press, quote, typed, type Key, type Unit } from "./amount";
import { usd } from "./money";
import { Numpad } from "./numpad";
import { blurred, easeOut, leave, sharp, snappy } from "./transitions";

type Side = "sol" | "usdc";
type Step = { name: "amount" | "review"; dir: 1 | -1 };

function token(id: Side, decimals: number) {
  const { name, symbol, amount, value } = coins.find((c) => c.id === id)!;
  return { name, symbol, balance: amount, price: value / amount, decimals };
}
const tokens = { sol: token("sol", 4), usdc: token("usdc", 2) };

const fmt = (n: number, decimals: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: decimals });

// The label cross-fades through blur, like the Send button's.
const labelSwap = { initial: { opacity: 0, filter: blurred }, animate: { opacity: 1, filter: sharp, transition: snappy }, exit: { opacity: 0, filter: blurred, transition: leave } };

// The review pushes in and pops back out like a screen (globals.css): forward arrives from the right
// through a blur while the amount steps left; back mirrors it. The leaving step goes faster.
const steps: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 24 : -12, filter: dir > 0 ? "blur(4px)" : sharp }),
  shown: { opacity: 1, x: 0, filter: sharp, transition: { duration: 0.26, ease: easeOut } },
  leave: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? -12 : 24,
    filter: dir > 0 ? sharp : "blur(4px)",
    pointerEvents: "none",
    transition: { duration: 0.16, ease: easeOut },
  }),
};

const card = "rounded-[24px] border bg-surface";
const pill =
  "relative outline-none transition-[scale,background-color,color] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.96]";

function Coin({ id, className = "size-10" }: { id: Side; className?: string }) {
  return (
    <motion.span layoutId={`swap-coin-${id}`} transition={snappy} className={`shrink-0 ${className}`}>
      <CoinLogo id={id} />
    </motion.span>
  );
}

/** Name over a detail line; flipping cross-fades it while the coin travels to the other card. */
function TokenLabel({ id, children }: { id: Side; children: ReactNode }) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.p key={id} className="min-w-0 flex-1 text-[14px] leading-5" {...labelSwap}>
        <span className="block text-[16px] font-semibold">{tokens[id].name}</span>
        {children}
      </motion.p>
    </AnimatePresence>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

export function SwapSheet({ open, onOpenChange, onClosed }: { open: boolean; onOpenChange: (o: boolean) => void; onClosed: () => void }) {
  const [from, setFrom] = useState<Side>("sol");
  const [unit, setUnit] = useState<Unit>("token");
  const [text, setText] = useState("");
  const [step, setStep] = useState<Step>({ name: "amount", dir: 1 });
  const [phase, setPhase] = useState<"idle" | "busy" | "done">("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const content = useRef<HTMLDivElement>(null);
  const proceed = useRef<HTMLButtonElement>(null);
  const summary = useRef<HTMLHeadingElement>(null);
  const [amount, animate] = useAnimate<HTMLOutputElement>();
  const still = useReducedMotion();

  const to: Side = from === "sol" ? "usdc" : "sol";
  const pay = tokens[from];
  const get = tokens[to];
  const q = quote(text, unit, pay.price, get.price);
  const over = Number(q.tokens.toFixed(pay.decimals)) > pay.balance;
  const ready = q.tokens > 0 && !over;

  const shown = `${unit === "usd" ? "$" : ""}${grouped(text)}`;
  const size = shown.length > 10 ? "text-[42px]" : shown.length > 7 ? "text-[52px]" : "text-[64px]";
  const other = unit === "token" ? usd.format(q.usd) : `${fmt(q.tokens, pay.decimals)} ${pay.symbol}`;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // Reset once fully closed, so reopening starts clean.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setText("");
      setFrom("sol");
      setUnit("token");
      setStep({ name: "amount", dir: 1 });
      setPhase("idle");
    }, 400);
    return () => clearTimeout(t);
  }, [open]);

  // Focus follows the step: the review's summary on the way in, Continue on the way back.
  useEffect(() => {
    if (step.name === "review") summary.current?.focus();
    else if (step.dir < 0) proceed.current?.focus();
  }, [step]);

  function tap(key: Key) {
    const next = press(text, key, unit === "usd" ? 2 : pay.decimals);
    if (next !== null) setText(next);
    else if (!still) animate(amount.current, { x: [0, -6, 5, -3, 2, 0] }, { duration: 0.3, ease: "easeOut" });
  }

  function review() {
    if (ready) setStep({ name: "review", dir: 1 });
  }

  // With a keyboard, digits type straight into the amount wherever focus is, and hand focus back to the
  // sheet, so Enter then continues rather than pressing whichever button was last clicked.
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) review();
    const key = e.key === "Backspace" ? "back" : e.key === "," ? "." : e.key;
    if (key !== "back" && !/^[\d.]$/.test(key)) return;
    e.preventDefault();
    tap(key as Key);
    content.current?.focus();
  });
  useEffect(() => {
    if (!open || step.name !== "amount") return;
    const listener = (e: KeyboardEvent) => onKeyDown(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [open, step.name]);

  function flip() {
    setFrom(to);
    // A dollar amount is worth the same either way round; a token amount becomes what it would have bought.
    if (unit === "token") setText(typed(q.out, get.decimals));
  }

  function switchUnit() {
    setUnit(unit === "token" ? "usd" : "token");
    setText(unit === "token" ? typed(q.usd, 2) : typed(q.tokens, pay.decimals));
  }

  function swap() {
    setPhase("busy");
    timers.current.push(
      setTimeout(() => setPhase("done"), 1200),
      setTimeout(() => onOpenChange(false), 1900),
    );
  }

  const continueLabel = over ? `Insufficient ${pay.symbol}` : "Continue";

  return (
    <Drawer open={open} onOpenChange={(o) => phase !== "busy" && onOpenChange(o)} dismissible={phase !== "busy"}>
      <DrawerContent
        ref={content}
        aria-describedby={undefined}
        // Focus the sheet rather than its close button, so Enter after typing continues instead of closing.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          content.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed();
        }}
        className="h-[calc(100dvh-env(safe-area-inset-top)-12px)] tracking-[-0.02em] sm:h-[min(46rem,calc(100dvh-2rem))]"
      >
        <header className="relative flex h-11 shrink-0 items-center justify-center">
          <AnimatePresence initial={false}>
            {step.name === "review" && (
              <motion.div
                key="back"
                className="absolute left-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: snappy }}
                exit={{ opacity: 0, transition: leave }}
              >
                <BackButton onClick={() => setStep({ name: "amount", dir: -1 })} disabled={phase !== "idle"} />
              </motion.div>
            )}
          </AnimatePresence>
          <DrawerTitle>Swap</DrawerTitle>
          <DrawerClose asChild>
            <BackButton kind="close" disabled={phase === "busy"} className="absolute right-4" />
          </DrawerClose>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout" custom={step.dir}>
            <motion.div
              key={step.name}
              custom={step.dir}
              variants={steps}
              initial="enter"
              animate="shown"
              exit="leave"
              className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-2 pb-[max(20px,env(safe-area-inset-bottom))] sm:pb-5"
            >
              {step.name === "amount" ? (
                <>
                  <section aria-label="You pay" className={`${card} flex max-h-80 min-h-fit flex-1 flex-col`}>
                    <div className="relative flex items-center gap-3 p-4">
                      <Coin key={from} id={from} />
                      <TokenLabel id={from}>
                        <span className={`block tabular-nums transition-colors duration-150 ${over ? "text-negative" : "text-black/40"}`}>
                          {fmt(pay.balance, pay.decimals)} {pay.symbol}
                        </span>
                      </TokenLabel>
                      <button
                        type="button"
                        onClick={() => setText(unit === "token" ? typed(pay.balance, pay.decimals) : typed(pay.balance * pay.price, 2))}
                        className={`${pill} h-8 shrink-0 rounded-full bg-black/[0.05] px-3 text-[13px] font-semibold after:absolute after:-inset-1.5 hover:bg-black/[0.08]`}
                      >
                        Use Max
                      </button>
                    </div>
                    <div aria-hidden className="mx-4 h-px bg-black/[0.06]" />
                    <div className="flex flex-1 flex-col items-center justify-center px-4 pt-[clamp(16px,3.6dvh,32px)] pb-[clamp(14px,3dvh,26px)]">
                      <output
                        ref={amount}
                        aria-live="polite"
                        className={`flex h-16 max-w-full items-center leading-none font-bold tracking-[-0.045em] tabular-nums ${size} ${text ? "" : "text-cents"}`}
                      >
                        {shown}
                        <span className="sr-only"> {unit === "usd" ? "dollars" : pay.symbol}</span>
                      </output>
                      <button
                        type="button"
                        onClick={switchUnit}
                        aria-label={`${other}. Type in ${unit === "token" ? "dollars" : pay.symbol}`}
                        className={`${pill} mt-2 flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[15px] font-medium text-black/55 tabular-nums after:absolute after:-inset-y-1.5 after:inset-x-0 hover:bg-black/[0.04] hover:text-black`}
                      >
                        <span className="grid size-[18px] place-items-center rounded-full bg-black/[0.07]">
                          <ApproximateEqualsIcon aria-hidden size={11} weight="bold" />
                        </span>
                        {other}
                        <ArrowsDownUpIcon aria-hidden size={15} weight="bold" />
                      </button>
                    </div>
                  </section>

                  <div className="relative z-10 h-2">
                    <button
                      type="button"
                      aria-label={`Switch to paying with ${get.symbol}`}
                      onClick={flip}
                      className={`${pill} absolute top-1/2 left-1/2 grid size-8 -translate-1/2 place-items-center rounded-full border-[3px] border-white bg-[#f0f0f0] text-black/50 after:absolute after:-inset-[9px] hover:text-black`}
                    >
                      <CaretDownIcon aria-hidden size={14} weight="bold" />
                    </button>
                  </div>

                  <section aria-label="You receive" className={`${card} relative flex items-center gap-3 p-4`}>
                    <Coin key={to} id={to} />
                    <TokenLabel id={to}>
                      <span className="block text-black/40">Receive {get.symbol}</span>
                    </TokenLabel>
                    <output className={`text-[17px] font-semibold tabular-nums transition-colors duration-150 ${q.out > 0 ? "" : "text-cents"}`}>
                      {fmt(q.out, get.decimals)}
                    </output>
                  </section>

                  <div className="mt-auto pt-4">
                    <Numpad onKey={tap} />
                    <Button ref={proceed} size="lg" onClick={review} disabled={!ready} className="mt-3 h-14 w-full">
                      <AnimatePresence initial={false} mode="popLayout">
                        <motion.span key={continueLabel} {...labelSwap}>
                          {continueLabel}
                        </motion.span>
                      </AnimatePresence>
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="my-auto py-6">
                    <div className="flex flex-col items-center text-center">
                      {/* The coins fly in from the cards, and back out on Back. */}
                      <span aria-hidden className="flex">
                        <Coin id={from} className="size-12" />
                        <Coin id={to} className="-ml-3 size-12 rounded-full bg-white ring-4 ring-white" />
                      </span>
                      <h2 ref={summary} tabIndex={-1} className="mt-5 text-[15px] leading-5 text-black/40 outline-none">
                        You receive
                      </h2>
                      <p className="mt-1 text-[40px] leading-[48px] font-bold tracking-[-0.035em] tabular-nums">
                        {fmt(q.out, get.decimals)} <span className="text-black/25">{get.symbol}</span>
                      </p>
                      <p className="mt-1 text-[15px] leading-5 text-black/40 tabular-nums">≈ {usd.format(q.usd)}</p>
                    </div>
  
                    <hr className="mt-10 h-px shrink-0 border-0 bg-[repeating-linear-gradient(90deg,rgb(0_0_0/0.1)_0_8px,transparent_8px_17px)]" />
  
                    <dl className="space-y-2 pt-4 text-[15px] leading-5 tracking-[-0.24px]">
                      <Detail label="You pay">
                        {fmt(q.tokens, pay.decimals)} {pay.symbol}
                      </Detail>
                      <Detail label="Rate">
                        1 {pay.symbol} ≈ {fmt(pay.price / get.price, get.decimals)} {get.symbol}
                      </Detail>
                      <Detail label="Network fee">
                        <span className="text-muted-foreground">
                          Fuse
                          <sup aria-hidden className="text-[11px]">
                            +
                          </sup>
                          <span className="sr-only"> Plus</span>
                        </span>{" "}
                        <span className="text-positive">Covered</span>
                      </Detail>
                    </dl>
                  </div>

                  <Button
                    size="lg"
                    onClick={swap}
                    disabled={phase !== "idle"}
                    aria-busy={phase === "busy"}
                    className={`h-14 w-full shrink-0 ${phase !== "idle" ? "disabled:opacity-100" : ""} ${phase === "done" ? "bg-positive hover:bg-positive" : ""}`}
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      <motion.span key={phase} className="flex items-center gap-2" {...labelSwap}>
                        {phase === "idle" && <ScanSmileyIcon aria-hidden size={20} weight="bold" />}
                        {phase === "busy" && <Spinner className="size-5" />}
                        {phase === "done" && <CheckIcon aria-hidden size={20} weight="bold" />}
                        {phase === "idle" ? "Swap" : phase === "busy" ? "Swapping" : "Swapped"}
                      </motion.span>
                    </AnimatePresence>
                  </Button>
                  <span className="sr-only" aria-live="polite">
                    {phase === "busy" ? "Swapping" : phase === "done" ? "Swapped" : ""}
                  </span>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
