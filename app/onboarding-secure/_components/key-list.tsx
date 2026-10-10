import { AnimatePresence, motion } from "motion/react";
import type { ReactNode, Ref } from "react";
import { blurred, sharp, smooth, snappy } from "@/app/(tabs)/_components/transitions";
import { CheckCircleIcon } from "@/components/icons";
import { CODE_SENT, SETUP, type WalletKey } from "../data";
import type { keyState } from "../flow";
import { blurSwap, iconSwap } from "./motion";

type KeyItemProps = {
  ref?: Ref<HTMLLIElement>;
  item: WalletKey;
  state: ReturnType<typeof keyState>;
  /** Set once the recovery code has been sent: swaps the body copy for the confirmation. */
  sentTo?: string;
  children?: ReactNode;
};

/** A key is a grey row until it is the current step, then it opens into its full copy. Once done, its row keeps the colour. */
export function KeyItem({ ref, item, state, sentTo, children }: KeyItemProps) {
  const done = state === "done";
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
        {state === "active" ? (
          <motion.div key="active" {...blurSwap} className="pt-[30px] pb-6">
            <item.Icon size={32} className="block" style={{ color: item.accent }} />
            <h2 className="mt-4 text-title">{item.title}</h2>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={sentTo ?? "body"}
                {...blurSwap}
                className={`mt-2 max-w-[258px] text-body text-muted-foreground ${sentTo ? "text-balance" : "text-pretty"}`}
              >
                {sentTo ? (
                  <>
                    {CODE_SENT} <span className="text-foreground">{sentTo}</span>
                  </>
                ) : (
                  item.body
                )}
              </motion.p>
            </AnimatePresence>
            {children}
          </motion.div>
        ) : (
          <motion.div key="row" {...blurSwap} className={`flex h-11 items-center gap-4 ${done ? "" : "text-muted-foreground"}`}>
            <item.Icon style={done ? { color: item.accent } : undefined} />
            <span className="text-label">{item.title}</span>
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
      className="mt-1.5 flex gap-4 px-4 py-2.5"
      aria-live="polite"
    >
      <span className="relative -mt-px grid size-6 shrink-0 place-items-center">
        <AnimatePresence initial={false}>
          <motion.span
            key={ready ? "ready" : "working"}
            {...iconSwap}
            className="absolute inset-0 grid place-items-center"
          >
            {ready ? <CheckCircleIcon className="text-positive" /> : <SetupSpinner />}
          </motion.span>
        </AnimatePresence>
      </span>
      <div className="grid">
        <AnimatePresence initial={false}>
          <motion.div key={copy.title} {...blurSwap} className="col-start-1 row-start-1">
            <p className="text-label">{copy.title}</p>
            <p className="mt-0.5 max-w-[190px] text-body text-pretty text-muted-foreground">{copy.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

function SetupSpinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 animate-[spin_2.4s_linear_infinite] text-faint" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="9.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="2.34 2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
