import type { Transition } from "motion/react";

/** Short, critically damped spring for swaps and small entrances. */
const snappy: Transition = { type: "spring", duration: 0.3, bounce: 0 };

/** Constant on-screen movement of the word wheel. */
export const roll: Transition = { duration: 0.6, ease: [0.77, 0, 0.175, 1] };

/** The hand-off blur-out. */
export const fade: Transition = { duration: 0.3, ease: [0.23, 1, 0.32, 1] };

/** Blur cross-fade used by every content swap on this screen. */
export const blurSwap = {
  initial: { opacity: 0, scale: 0.9, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.9, filter: "blur(4px)" },
  transition: snappy,
};
