import { CheckCircleIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode, Ref } from "react";
import { blurred, sharp, smooth, snappy } from "@/app/(tabs)/_components/transitions";
import { CODE_SENT, SETUP, type WalletKey } from "../data";
import { blurSwap, iconSwap } from "./motion";

type KeyItemProps = {
  ref?: Ref<HTMLLIElement>;
  item: WalletKey;
  active: boolean;
  /** Set once the recovery code has been sent: swaps the body copy for the confirmation. */
  sentTo?: string;
  children?: ReactNode;
};

/** A key is a grey row until it is the current step, then it opens into its full copy. */
export function KeyItem({ ref, item, active, sentTo, children }: KeyItemProps) {
  return (
    <motion.li
      ref={ref}
      layout="position"
      initial={{ opacity: 0, filter: blurred }}
      animate={{ opacity: 1, filter: sharp }}
      exit={blurSwap.exit}
      // Rows that come back wait for the content around them to settle first.
      transition={{ ...snappy, delay: 0.15, layout: smooth }}
      className="relative px-4"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {active ? (
          <motion.div key="active" {...blurSwap} className="pt-[30px] pb-6">
            <span className="block" style={{ color: item.accent }}>
              <item.Icon weight="fill" size={26} aria-hidden />
            </span>
            <h2 className="mt-4 text-[28px] leading-[34px] font-bold tracking-[-0.02em] text-black">{item.title}</h2>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={sentTo ?? "body"}
                {...blurSwap}
                className={`mt-2 max-w-[258px] text-[15px] leading-[19px] text-black/40 ${sentTo ? "text-balance" : "text-pretty"}`}
              >
                {sentTo ? (
                  <>
                    {CODE_SENT} <span className="text-black">{sentTo}</span>
                  </>
                ) : (
                  item.body
                )}
              </motion.p>
            </AnimatePresence>
            {children}
          </motion.div>
        ) : (
          <motion.div key="row" {...blurSwap} className="flex h-11 items-center gap-3">
            <item.Icon weight="fill" size={22} aria-hidden className="text-black/[0.18]" />
            <span className="text-[17px] font-semibold text-black/40">{item.title}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export function SetupRow({ ref, ready }: { ref?: Ref<HTMLLIElement>; ready: boolean }) {
  const copy = ready ? SETUP.ready : SETUP.working;
  return (
    <motion.li
      ref={ref}
      layout="position"
      {...blurSwap}
      transition={{ ...snappy, delay: 0.25, layout: smooth }}
      className="mt-1.5 flex gap-3 px-4 py-2.5"
      aria-live="polite"
    >
      <span className="relative mt-px grid size-[22px] shrink-0 place-items-center">
        <AnimatePresence initial={false}>
          <motion.span
            key={ready ? "ready" : "working"}
            {...iconSwap}
            className="absolute inset-0 grid place-items-center"
          >
            {ready ? <CheckCircleIcon size={27} weight="fill" className="text-positive" /> : <SetupSpinner />}
          </motion.span>
        </AnimatePresence>
      </span>
      <div className="grid">
        <AnimatePresence initial={false}>
          <motion.div key={copy.title} {...blurSwap} className="col-start-1 row-start-1">
            <p className="text-[17px] leading-[22px] font-semibold text-black">{copy.title}</p>
            <p className="mt-0.5 max-w-[190px] text-[15px] leading-[19px] text-pretty text-black/40">{copy.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

function SetupSpinner() {
  return (
    <svg viewBox="0 0 22 22" className="size-[22px] animate-[spin_2.4s_linear_infinite]" aria-hidden>
      <circle
        cx="11"
        cy="11"
        r="9.5"
        fill="none"
        stroke="#a79ab5"
        strokeWidth="1.75"
        strokeDasharray="2.4 2.57"
        strokeLinecap="round"
      />
    </svg>
  );
}
