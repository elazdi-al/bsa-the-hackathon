import type { Transition } from "motion/react";

export const easeOut = [0.23, 1, 0.32, 1] as const;

export const labelSpring = { type: "spring", visualDuration: 0.26, bounce: 0 } satisfies Transition;

export const fade = { duration: 0.2, ease: easeOut } satisfies Transition;

export const blurSwap = {
  initial: { opacity: 0, filter: "blur(6px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(6px)" },
  transition: fade,
};
