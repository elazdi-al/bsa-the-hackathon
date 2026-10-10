import type { Transition } from "motion/react";

export const easeOut = [0.23, 1, 0.32, 1] as const;

export const springs = {
  knob: { type: "spring", visualDuration: 0.32, bounce: 0.15 },
  lens: { type: "spring", visualDuration: 0.22, bounce: 0.25 },
  label: { type: "spring", visualDuration: 0.26, bounce: 0 },
  sheet: { type: "spring", visualDuration: 0.42, bounce: 0 },
} satisfies Record<string, Transition>;

export const fade = { duration: 0.2, ease: easeOut } satisfies Transition;

export const blurSwap = {
  initial: { opacity: 0, filter: "blur(6px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(6px)" },
  transition: fade,
};
