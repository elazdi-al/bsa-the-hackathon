import type { Transition } from "motion/react";

/** Movement: rows sliding, content lifting, layout changes. Critically damped. */
export const glide: Transition = { type: "spring", duration: 0.55, bounce: 0 };

/** Quick state swaps: labels, icons, cross-fades through blur. */
export const snap: Transition = { type: "spring", duration: 0.3, bounce: 0 };

export const easeOut = [0.23, 1, 0.32, 1] as const;

/** Text and blocks enter from a blur and leave the same way, softer on the way out. */
export const blurSwap = {
  initial: { opacity: 0, filter: "blur(6px)", y: 6 },
  animate: { opacity: 1, filter: "blur(0px)", y: 0 },
  exit: { opacity: 0, filter: "blur(4px)", y: -3 },
  transition: snap,
};

export const iconSwap = {
  initial: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  transition: snap,
};
