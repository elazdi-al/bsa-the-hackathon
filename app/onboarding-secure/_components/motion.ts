import type { Transition } from "motion/react";
import { blurred, leave, sharp, snappy } from "@/app/(tabs)/_components/transitions";

/** Text and blocks enter from a blur and leave the same way, quicker on the way out. */
export const blurSwap = {
  initial: { opacity: 0, filter: blurred, y: 6 },
  animate: { opacity: 1, filter: sharp, y: 0 },
  exit: { opacity: 0, filter: blurred, y: -3, transition: leave },
  transition: snappy,
};

/** Every moving part of the list shares one layout spring, so nothing drifts past anything else. */
export const layoutSpring = { type: "spring", duration: 0.5, bounce: 0 } satisfies Transition;

/** The app's icon swap, as in the Receive sheet. */
export const iconSwap = {
  initial: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: sharp },
  exit: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  transition: { type: "spring", duration: 0.3, bounce: 0 } satisfies Transition,
};
