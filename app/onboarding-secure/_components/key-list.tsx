import { AnimatePresence, motion } from "motion/react";
import type { ReactNode, Ref } from "react";
import { blurred, easeOut, sharp, snappy } from "@/app/(tabs)/_components/transitions";
import { shortAddress } from "@/app/choose-recipient/data";
import { CheckCircleIcon, WarningIcon } from "@/components/icons";
import { SETUP, type WalletKey } from "../data";
import type { keyState, Step } from "../flow";
import { blurSwap, iconSwap, layoutSpring } from "./motion";

type KeyItemProps = {
  ref?: Ref<HTMLLIElement>;
  item: WalletKey;
  state: ReturnType<typeof keyState>;
  children?: ReactNode;
};

// The body waits for the card to open before it blurs in, and leaves before the card folds over it.
const body = {
  initial: { opacity: 0, filter: "blur(4px)", y: 6 },
  animate: { opacity: 1, filter: sharp, y: 0, transition: { ...snappy, delay: 0.12 } },
  exit: { opacity: 0, filter: "blur(4px)", transition: { duration: 0.12, ease: easeOut } },
};

// Accents are CSS variables, which Motion can't tween, so colour changes ride a CSS transition.
// The title's weight rides it too, or 700 and 600 swap in one frame while the text is still large.
const tint = "transition-[color,font-weight] duration-300 ease-out";

/** A key is a grey row until it is the current step, then it opens into its full copy. Once done, its row keeps the colour. */
export function KeyItem({ ref, item, state, children }: KeyItemProps) {
  const active = state === "active";
  const pending = state === "pending";
  return (
    <motion.li
      ref={ref}
      layout="position"
      initial={{ opacity: 0, filter: blurred }}
      animate={{ opacity: 1, filter: sharp }}
      exit={blurSwap.exit}
      // Rows that come back wait for the content around them to settle first.
      transition={{ ...snappy, delay: 0.15, layout: layoutSpring }}
      className="relative px-4"
    >
      {/* One structure for row and card: the icon and title morph between the two instead of swapping. */}
      <div className={active ? "pt-[30px] pb-6" : "flex h-11 items-center gap-4"}>
        <motion.span
          layout
          transition={layoutSpring}
          className={`block w-fit ${tint} ${pending ? "text-muted-foreground" : ""}`}
          style={pending ? undefined : { color: item.accent }}
        >
          <item.Icon size={active ? 32 : undefined} className="block" />
        </motion.span>
        <motion.h2
          layout
          transition={layoutSpring}
          className={`w-fit ${tint} ${active ? "mt-4 text-title" : "text-label"} ${pending ? "text-muted-foreground" : "text-foreground"}`}
        >
          {item.title}
        </motion.h2>
        <AnimatePresence initial={false} mode="popLayout">
          {active && (
            <motion.div key="body" {...body}>
              <p className="mt-2 max-w-[258px] text-body text-pretty text-muted-foreground">{item.body}</p>
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

type SetupStep = Extract<Step, { name: "setup" }>;

/** What the row shows for each status. Registered still reads as working: it is the beat that lets that copy be read. */
function setupView(step: SetupStep): { title: string; body: string; icon: ReactNode } {
  switch (step.status) {
    case "working":
    case "registered":
      return { ...SETUP.working, icon: <SetupSpinner /> };
    case "idle":
      return { ...SETUP.idle, icon: <WarningIcon className="text-negative" /> };
    case "ready":
      return { ...SETUP.ready, body: shortAddress(step.address), icon: <CheckCircleIcon className="text-positive" /> };
  }
}

export function SetupRow({ ref, step }: { ref?: Ref<HTMLLIElement>; step: SetupStep }) {
  const { title, body, icon } = setupView(step);
  return (
    <motion.li
      ref={ref}
      layout="position"
      {...blurSwap}
      transition={{ ...snappy, delay: 0.25, layout: layoutSpring }}
      className="mt-1.5 flex gap-4 px-4 py-2.5"
      aria-live="polite"
    >
      <span className="relative -mt-px grid size-6 shrink-0 place-items-center">
        <AnimatePresence initial={false}>
          <motion.span key={title} {...iconSwap} className="absolute inset-0 grid place-items-center">
            {icon}
          </motion.span>
        </AnimatePresence>
      </span>
      <div className="grid">
        <AnimatePresence initial={false}>
          <motion.div key={title} {...blurSwap} className="col-start-1 row-start-1">
            <p className="text-label">{title}</p>
            <p className="mt-0.5 max-w-[240px] text-body text-pretty text-muted-foreground tabular-nums">{body}</p>
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
