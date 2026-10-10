import type { Variants } from "motion/react";
import { leave, sharp } from "@/app/(tabs)/_components/transitions";

// The app's icon swap, as in the Receive sheet.
const iconSwap = { type: "spring", duration: 0.3, bounce: 0 } as const;

/** Text swaps cross-fade through blur. */
export const blurSwap: Variants = {
  hidden: { opacity: 0, filter: "blur(4px)", transition: leave },
  shown: { opacity: 1, filter: sharp },
};

/** Icons sharpen in from a blurred quarter scale, a beat after their label. */
export const iconPop: Variants = {
  hidden: { opacity: 0, scale: 0.25, filter: "blur(4px)", transition: leave },
  shown: { opacity: 1, scale: 1, filter: sharp, transition: { ...iconSwap, delay: 0.05 } },
};
