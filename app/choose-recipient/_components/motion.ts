import type { Transition, Variants } from "motion/react";

/** Default for small state changes on this screen (set on MotionConfig). */
export const swapSpring: Transition = { type: "spring", duration: 0.3, bounce: 0 };
export const sheetSpring: Transition = { type: "spring", duration: 0.5, bounce: 0 };
export const pressSpring: Transition = { type: "spring", duration: 0.2, bounce: 0 };

/** Exits are quicker than enters, so the outgoing state never lingers. */
const quickExit: Transition = { duration: 0.12, ease: "easeOut" };

/** Text swaps cross-fade through blur. */
export const blurSwap: Variants = {
  hidden: { opacity: 0, filter: "blur(4px)", transition: quickExit },
  shown: { opacity: 1, filter: "blur(0px)" },
};

/** Icons sharpen in from a blurred quarter scale, a beat after their label. */
export const iconPop: Variants = {
  hidden: { opacity: 0, scale: 0.25, filter: "blur(4px)", transition: quickExit },
  shown: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { ...swapSpring, delay: 0.05 } },
};
