import type { Transition } from "motion/react";
import { leave, sharp } from "@/app/(tabs)/_components/transitions";

export const easeOut = [0.23, 1, 0.32, 1] as const;

export const labelSpring = { type: "spring", visualDuration: 0.26, bounce: 0 } satisfies Transition;

export const blurSwap = {
  initial: { opacity: 0, filter: "blur(6px)" },
  animate: { opacity: 1, filter: sharp },
  exit: { opacity: 0, filter: "blur(6px)" },
  transition: leave,
};
