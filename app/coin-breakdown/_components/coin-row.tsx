import { AnimatePresence, motion, stagger, type Variants } from "motion/react";
import { availableShare, stakedTotal, type Coin } from "../data";
import { CoinLogo } from "./coin-logos";
import { Recede, blurredOut, easeOut, quickOut, sharp, spring } from "./motion";

type RowState = "idle" | "open" | "receded";

const amount = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const signedUsd = (n: number) => `${n < 0 ? "-" : "+"}${usd.format(Math.abs(n))}`;

export function CoinRow({ coin, state, onToggle }: { coin: Coin; state: RowState; onToggle: () => void }) {
  const open = state === "open";
  const panelId = `breakdown-${coin.id}`;

  return (
    <li className="relative">
      <Recede active={state === "receded"}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full items-center gap-4 px-[22px] py-[15px] text-left outline-none transition-transform duration-150 ease-out focus-visible:bg-black/[0.04] active:scale-[0.98]"
        >
          <CoinAvatar coin={coin} open={open} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px]/[22px] font-semibold tracking-[-0.01em]">{coin.name}</span>
            <span className="mt-0.5 block truncate text-[15px]/5 text-[#858585]">
              {amount.format(coin.amount)} {coin.symbol}
            </span>
          </span>
          <span className="shrink-0 text-right text-[15px] font-medium">
            <span className="block leading-[22px]">{usd.format(coin.value)}</span>
            {coin.change !== undefined && (
              <span className={`mt-0.5 block leading-5 ${coin.change < 0 ? "text-[#ec4d73]" : "text-[#34c759]"}`}>
                {signedUsd(coin.change)}
              </span>
            )}
          </span>
        </button>
      </Recede>
      <AnimatePresence>{open && <Breakdown key="breakdown" id={panelId} coin={coin} />}</AnimatePresence>
    </li>
  );
}

/** Logo with its available-vs-staked ring. When the row opens the bar below takes over: the ring fades and the logo grows into its space. */
function CoinAvatar({ coin, open }: { coin: Coin; open: boolean }) {
  const ring = coin.stake !== undefined && !open;
  const available = availableShare(coin) * 100;
  const gap = 3.5;

  return (
    <span className="relative size-[42px] shrink-0">
      {coin.stake && (
        <motion.svg
          viewBox="0 0 42 42"
          aria-hidden
          initial={false}
          animate={{ opacity: ring ? 1 : 0 }}
          transition={ring ? spring : quickOut}
          // Mirrored and turned so the arc starts at 12 o'clock and runs counter-clockwise, as in the app.
          className="absolute inset-0 size-full rotate-90 -scale-x-100"
        >
          <g fill="none" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="21" cy="21" r="19.9" pathLength={100} stroke="#dddddd" strokeDasharray={`${100 - available - gap * 2} 100`} strokeDashoffset={-(available + gap)} />
            <circle cx="21" cy="21" r="19.9" pathLength={100} stroke="#2676d9" strokeDasharray={`${available} 100`} />
          </g>
        </motion.svg>
      )}
      <motion.span className="block size-full" initial={false} animate={{ scale: ring ? 0.83 : 1 }} transition={spring}>
        <CoinLogo id={coin.id} />
      </motion.span>
    </span>
  );
}

const panel: Variants = {
  shown: { transition: { delayChildren: stagger(0.03, { startDelay: 0.04 }) } },
};

const bar: Variants = {
  hidden: { clipPath: "inset(0 100% 0 0)", opacity: 0 },
  shown: { clipPath: "inset(0 0% 0 0)", ...sharp, transition: { duration: 0.35, ease: easeOut, opacity: { duration: 0.15 } } },
  gone: { ...blurredOut, transition: quickOut },
};

const line: Variants = {
  hidden: { ...blurredOut, y: -6 },
  shown: { ...sharp, y: 0, transition: spring },
  gone: { ...blurredOut, y: -4, transition: quickOut },
};

function Breakdown({ id, coin }: { id: string; coin: Coin }) {
  const staked = stakedTotal(coin);
  const available = coin.amount - staked;
  const unit = (n: number) => `${amount.format(n)} ${coin.symbol}`;

  return (
    <motion.div
      id={id}
      variants={panel}
      initial="hidden"
      animate="shown"
      exit="gone"
      className="absolute inset-x-0 top-full z-10 pt-[3px] pr-[22px] pl-20 text-[15px] font-medium"
    >
      <motion.div variants={bar} className="flex h-1 gap-1">
        <span className="rounded-full bg-[#2676d9]" style={{ width: `${availableShare(coin) * 100}%` }} />
        {staked > 0 && <span className="flex-1 rounded-full bg-[#dadada]" />}
      </motion.div>

      <div className="mt-[13px]">
        <Line dot="bg-[#2676d9]" label="Available" value={unit(available)} />
        <Line dot="bg-[#dcdcdc]" label={coin.stake?.label ?? "Total Staked"} value={unit(staked)} />
        {coin.stake && (
          <>
            <motion.div
              variants={line}
              aria-hidden
              className="my-[7px] ml-6 h-px bg-[linear-gradient(to_right,#d4d4d4_50%,transparent_0)] bg-size-[10px_1px]"
            />
            <Line label={coin.stake.principalLabel} value={unit(coin.stake.principal)} />
            <Line label="Earned" value={`+ ${unit(coin.stake.earned)}`} valueClass="text-[#34c759]" />
          </>
        )}
      </div>
    </motion.div>
  );
}

function Line({ dot, label, value, valueClass }: { dot?: string; label: string; value: string; valueClass?: string }) {
  return (
    <motion.div variants={line} className="flex h-8 items-center">
      <span className="flex flex-1 items-center gap-[13px]">
        <span aria-hidden className={`size-[11px] rounded-full ${dot ?? "invisible"}`} />
        {label}
      </span>
      <span className={valueClass}>{value}</span>
    </motion.div>
  );
}
