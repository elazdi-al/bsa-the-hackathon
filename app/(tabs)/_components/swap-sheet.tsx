"use client";

import { AnimatePresence, motion, useAnimate, useReducedMotion, type Variants } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { formatUnits, parseUnits } from "viem";
import { CoinLogo } from "@/app/coin-breakdown/_components/coin-logos";
import { failure } from "@/app/send/_components/send-review";
import { ApproxIcon, CheckIcon, ChevronDownIcon, FaceIdIcon, FlipIcon, LightningIcon } from "@/components/icons";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { phone, type Prepared } from "@/lib/wallet/phone";
import { DECIMALS, minOut, quoteOut, type PoolToken } from "@/lib/wallet/pool";
import { grouped, press, quote, typed, type Key, type Unit } from "./amount";
import { usd } from "./money";
import { Numpad } from "./numpad";
import { blurred, easeOut, leave, sharp, snappy } from "./transitions";
import { refreshWallet, useWallet, type WalletSnapshot } from "./wallet";

type Side = "eth" | "usdc";

// The wallet's ETH here is the pool's WETH. `decimals` is how finely the sheet types and shows each.
const tokens = {
  eth: { name: "Ethereum", symbol: "ETH", pool: "weth", decimals: 4 },
  usdc: { name: "USD Coin", symbol: "USDC", pool: "usdc", decimals: 2 },
} as const satisfies Record<Side, { name: string; symbol: string; pool: PoolToken; decimals: number }>;

/** Base units of `side` as a number of tokens, and back, as the numpad would have typed it. */
const fromUnits = (units: bigint, side: Side) => Number(formatUnits(units, DECIMALS[tokens[side].pool]));
const toUnits = (n: number, side: Side) => parseUnits((Number.isFinite(n) && typed(n, tokens[side].decimals)) || "0", DECIMALS[tokens[side].pool]);

/** A swap exactly as Swissquote prepared it: the review shows what the operation enforces, not a live quote. */
type Swap = { from: Side; amountIn: bigint; out: bigint; minimum: bigint; usd: number; prepared: Prepared };
type Step = { name: "amount"; dir: 1 | -1 } | { name: "review"; dir: 1; swap: Swap };

/** The swap's own price in USDC per ETH, whichever way round it goes. */
const rate = ({ from, amountIn, out }: Swap) =>
  from === "usdc" ? fromUnits(amountIn, "usdc") / fromUnits(out, "eth") : fromUnits(out, "usdc") / fromUnits(amountIn, "eth");

const UNAVAILABLE: Record<Exclude<WalletSnapshot["status"], "ready">, string> = {
  loading: "",
  none: "This phone has no wallet yet.",
  missing: "Swissquote can't find this wallet.",
  offline: "Can't reach Swissquote. Check your connection.",
};

/** Why this phone can't swap, as a calm line like Send's; "" holds Continue without a word while the wallet loads. */
function blocker(snapshot: WalletSnapshot): string | undefined {
  if (snapshot.status !== "ready") return UNAVAILABLE[snapshot.status];
  const { controls, recovery, restoring } = snapshot.wallet;
  if (controls) return undefined;
  if (recovery?.mine) return "You can swap once your wallet is restored on this phone.";
  return restoring ? "Your recovery was cancelled, so this phone can't swap yet." : "Your wallet moved to another phone, so this one can't swap from it.";
}

// A guaranteed minimum rounds down, so it never reads as more than the pool promises.
const fmt = (n: number, decimals: number, roundingMode: "halfExpand" | "floor" = "halfExpand") =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: decimals, roundingMode });

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
      <motion.p key={id} className="min-w-0 flex-1 text-body" {...labelSwap}>
        <span className="block text-label">{tokens[id].name}</span>
        {children}
      </motion.p>
    </AnimatePresence>
  );
}

function Detail({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", className)}>{children}</dd>
    </div>
  );
}

export function SwapSheet({ open, onOpenChange, onClosed }: { open: boolean; onOpenChange: (o: boolean) => void; onClosed: () => void }) {
  // The wallet holds USDC, so it pays with USDC to start.
  const [from, setFrom] = useState<Side>("usdc");
  const [unit, setUnit] = useState<Unit>("token");
  const [text, setText] = useState("");
  // Use Max pays the exact balance rather than the rounded one the amount shows, until the amount changes.
  const [max, setMax] = useState(false);
  const [step, setStep] = useState<Step>({ name: "amount", dir: 1 });
  const [phase, setPhase] = useState<"idle" | "checking" | "swapping" | "done">("idle");
  const [error, setError] = useState<string[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const content = useRef<HTMLDivElement>(null);
  const proceed = useRef<HTMLButtonElement>(null);
  const summary = useRef<HTMLHeadingElement>(null);
  const [amount, animate] = useAnimate<HTMLOutputElement>();
  const still = useReducedMotion();

  const snapshot = useWallet();
  const wallet = snapshot.status === "ready" ? snapshot.wallet : undefined;
  const balance = { eth: wallet?.weth ?? 0, usdc: wallet?.usdc ?? 0 };
  const price = { eth: wallet?.ethPrice ?? 0, usdc: 1 };

  const to: Side = from === "eth" ? "usdc" : "eth";
  const pay = tokens[from];
  const get = tokens[to];
  const q = quote(text, unit, price[from], price[to]);
  const held = wallet?.units[pay.pool] ?? 0n;
  const amountIn = max ? held : toUnits(q.tokens, from);
  // The pool's own formula over the reserves last read: what the swap would get on chain.
  const out = wallet?.pool ? quoteOut(wallet.pool, pay.pool, amountIn) : 0n;
  const over = amountIn > held;
  const blocked = blocker(snapshot);
  const ready = amountIn > 0n && minOut(out) > 0n && !over && blocked === undefined;
  const busy = phase === "checking" || phase === "swapping";

  const shown = `${unit === "usd" ? "$" : ""}${grouped(text)}`;
  const size = shown.length > 14 ? "text-title" : shown.length > 9 ? "text-amount" : "text-display";
  const other = unit === "token" ? usd.format(q.usd) : `${fmt(q.tokens, pay.decimals)} ${pay.symbol}`;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // Reset once fully closed, so reopening starts clean.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setText("");
      setFrom("usdc");
      setUnit("token");
      setMax(false);
      setStep({ name: "amount", dir: 1 });
      setPhase("idle");
      setError([]);
    }, 400);
    return () => clearTimeout(t);
  }, [open]);

  // Focus follows the step: the review's summary on the way in, Continue on the way back.
  useEffect(() => {
    if (step.name === "review") summary.current?.focus();
    else if (step.dir < 0) proceed.current?.focus();
  }, [step]);

  /** A new amount: the typed one again, and the last error no longer applies. */
  function change(next: string, all = false) {
    setText(next);
    setMax(all);
    setError([]);
  }

  function tap(key: Key) {
    if (phase !== "idle") return;
    const next = press(text, key, unit === "usd" ? 2 : pay.decimals);
    if (next !== null) change(next);
    else if (!still) animate(amount.current, { x: [0, -6, 5, -3, 2, 0] }, { duration: 0.3, ease: "easeOut" });
  }

  // Continue asks Swissquote to check and prepare this exact swap, so Face ID on the review can follow straight
  // from the tap, as Safari requires. The review then shows the operation's own amounts.
  async function review() {
    if (!ready || phase !== "idle") return;
    const minimum = minOut(out);
    setPhase("checking");
    setError([]);
    try {
      const prepared = await phone.prepareSwap(pay.pool, amountIn, minimum);
      setStep({ name: "review", dir: 1, swap: { from, amountIn, out, minimum, usd: fromUnits(out, to) * price[to], prepared } });
    } catch (e) {
      setError(failure(e));
    }
    setPhase("idle");
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
    change(unit === "token" ? typed(fromUnits(out, to), get.decimals) : text);
  }

  function switchUnit() {
    setUnit(unit === "token" ? "usd" : "token");
    setText(unit === "token" ? typed(q.usd, 2) : typed(q.tokens, pay.decimals));
  }

  async function swap(prepared: Prepared) {
    setPhase("swapping");
    try {
      await phone.approve(prepared);
      setPhase("done");
      refreshWallet();
      timers.current.push(setTimeout(() => onOpenChange(false), 700));
    } catch (e) {
      // The operation is spent or its sponsorship lapsed. Back on the amount, the quote catches up with a moved
      // price and Continue checks a fresh one.
      refreshWallet();
      setPhase("idle");
      setStep({ name: "amount", dir: -1 });
      setError(failure(e));
    }
  }

  const short = !over ? "" : balance[from] > 0 ? `You have only ${fmt(balance[from], pay.decimals)} ${pay.symbol} to swap.` : `You have no ${pay.symbol} to swap.`;

  return (
    <Drawer open={open} onOpenChange={(o) => !busy && onOpenChange(o)} dismissible={!busy}>
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
        className="h-[calc(100dvh-env(safe-area-inset-top)-12px)] sm:h-[min(46rem,calc(100dvh-2rem))]"
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
            <BackButton kind="close" disabled={busy} className="absolute right-4" />
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
                        <span className={`block tabular-nums transition-colors duration-150 ${over ? "text-negative" : "text-muted-foreground"}`}>
                          {fmt(balance[from], pay.decimals)} {pay.symbol}
                        </span>
                      </TokenLabel>
                      <button
                        type="button"
                        disabled={phase !== "idle"}
                        onClick={() => change(unit === "token" ? typed(balance[from], pay.decimals) : typed(balance[from] * price[from], 2), true)}
                        className={`${pill} h-8 shrink-0 rounded-full bg-secondary px-3 text-caption font-semibold after:absolute after:-inset-1.5 hover:bg-black/[0.08]`}
                      >
                        Use Max
                      </button>
                    </div>
                    <div aria-hidden className="mx-4 h-px bg-border" />
                    <div className="flex flex-1 flex-col items-center justify-center px-4 pt-[clamp(16px,3.6dvh,32px)] pb-[clamp(14px,3dvh,26px)]">
                      <output
                        ref={amount}
                        aria-live="polite"
                        className={`flex h-16 max-w-full items-center tabular-nums ${size} ${text ? "" : "text-cents"}`}
                      >
                        {shown}
                        <span className="sr-only"> {unit === "usd" ? "dollars" : pay.symbol}</span>
                      </output>
                      <button
                        type="button"
                        disabled={phase !== "idle"}
                        onClick={switchUnit}
                        aria-label={`${other}. Type in ${unit === "token" ? "dollars" : pay.symbol}`}
                        className={`${pill} mt-2 flex h-8 items-center gap-1 rounded-full px-2.5 text-body font-medium text-muted-foreground tabular-nums after:absolute after:-inset-y-1.5 after:inset-x-0 hover:bg-black/[0.04] hover:text-foreground`}
                      >
                        <ApproxIcon size={16} />
                        {other}
                        <FlipIcon size={16} />
                      </button>
                    </div>
                  </section>

                  <div className="relative z-10 h-2">
                    <button
                      type="button"
                      aria-label={`Switch to paying with ${get.symbol}`}
                      disabled={phase !== "idle"}
                      onClick={flip}
                      className={`${pill} absolute top-1/2 left-1/2 grid size-8 -translate-1/2 place-items-center rounded-full border-[3px] border-background bg-secondary text-muted-foreground after:absolute after:-inset-[9px] hover:text-foreground`}
                    >
                      <ChevronDownIcon size={14} />
                    </button>
                  </div>

                  <section aria-label="You receive" className={`${card} relative flex items-center gap-3 p-4`}>
                    <Coin key={to} id={to} />
                    <TokenLabel id={to}>
                      <span className="block truncate text-muted-foreground">Receive {get.symbol}</span>
                    </TokenLabel>
                    <output className={`text-label tabular-nums transition-colors duration-150 ${out > 0n ? "" : "text-cents"}`}>
                      {fmt(fromUnits(out, to), get.decimals)}
                    </output>
                  </section>

                  <div className="mt-auto pt-4">
                    <Numpad onKey={tap} />
                    {error.length > 0 ? (
                      <div role="alert" className="mt-2 text-center text-caption text-negative">
                        {error.map((line) => (
                          <p key={line} className="first-letter:uppercase">
                            {line}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p aria-live="polite" className={cn("mt-2 h-lh text-center text-caption text-balance", short ? "text-negative" : "text-muted-foreground")}>
                        {short || blocked}
                      </p>
                    )}
                    {/* Focusable while checking, so focus stays put if Swissquote refuses. */}
                    <Button
                      ref={proceed}
                      size="lg"
                      onClick={review}
                      disabled={!ready || phase !== "idle"}
                      focusableWhenDisabled
                      aria-busy={phase === "checking"}
                      className={cn("mt-2 h-14 w-full aria-disabled:active:scale-100", !ready && "opacity-35")}
                    >
                      <AnimatePresence initial={false} mode="popLayout">
                        <motion.span key={phase === "checking" ? "checking" : "continue"} className="flex items-center gap-2" {...labelSwap}>
                          {phase === "checking" && <Spinner aria-hidden className="size-5" />}
                          {phase === "checking" ? "Checking" : "Continue"}
                        </motion.span>
                      </AnimatePresence>
                    </Button>
                    <span className="sr-only" aria-live="polite">
                      {phase === "checking" ? "Checking" : ""}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="my-auto py-6">
                    <div className="flex flex-col items-center text-center">
                      {/* The coins fly in from the cards, and back out on Back. */}
                      <span aria-hidden className="flex">
                        <Coin id={from} className="size-12" />
                        <Coin id={to} className="-ml-3 size-12 rounded-full bg-background ring-4 ring-background" />
                      </span>
                      <h2 ref={summary} tabIndex={-1} className="mt-5 text-body text-muted-foreground outline-none">
                        You receive
                      </h2>
                      <p className="mt-1 text-amount tabular-nums">
                        {fmt(fromUnits(step.swap.out, to), get.decimals)} <span className="text-faint">{get.symbol}</span>
                      </p>
                      <p className="mt-1 text-body text-muted-foreground tabular-nums">≈ {usd.format(step.swap.usd)}</p>
                    </div>

                    <hr className="mt-10 h-px shrink-0 border-0 bg-[repeating-linear-gradient(90deg,var(--color-cents)_0_8px,transparent_8px_17px)]" />

                    <dl className="space-y-2 pt-4 text-body">
                      <Detail label="You pay">
                        {fmt(fromUnits(step.swap.amountIn, from), pay.decimals)} {pay.symbol}
                      </Detail>
                      <Detail label="Rate">1 ETH ≈ {fmt(rate(step.swap), 2)} USDC</Detail>
                      <Detail label="Minimum received">
                        {fmt(fromUnits(step.swap.minimum, to), get.decimals, "floor")} {get.symbol}
                      </Detail>
                      {wallet && !wallet.owner ? (
                        <Detail label="Network fee">Paid from your wallet</Detail>
                      ) : (
                        <Detail label="Network fee" className="flex items-center gap-1 font-semibold text-positive">
                          <LightningIcon size={16} />
                          Paid by Swissquote
                        </Detail>
                      )}
                    </dl>
                  </div>

                  <Button
                    size="lg"
                    onClick={() => swap(step.swap.prepared)}
                    disabled={phase !== "idle"}
                    aria-busy={phase === "swapping"}
                    className={`h-14 w-full shrink-0 ${phase !== "idle" ? "disabled:opacity-100" : ""} ${phase === "done" ? "bg-positive hover:bg-positive" : ""}`}
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      <motion.span key={phase} className="flex items-center gap-2" {...labelSwap}>
                        {phase === "idle" && <FaceIdIcon size={20} />}
                        {phase === "swapping" && <Spinner aria-hidden className="size-5" />}
                        {phase === "done" && <CheckIcon size={20} />}
                        {phase === "done" ? "Swapped" : phase === "swapping" ? "Swapping" : "Swap"}
                      </motion.span>
                    </AnimatePresence>
                  </Button>
                  <span className="sr-only" aria-live="polite">
                    {phase === "swapping" ? "Swapping" : phase === "done" ? "Swapped" : ""}
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
