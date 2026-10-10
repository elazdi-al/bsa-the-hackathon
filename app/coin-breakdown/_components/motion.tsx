import { motion, type Transition } from "motion/react";
import type { ReactNode } from "react";

export const easeOut = [0.23, 1, 0.32, 1] as const;
const easeInOut = [0.65, 0, 0.35, 1] as const;

export const spring: Transition = { type: "spring", duration: 0.35, bounce: 0 };
/** Exits are quicker and softer than entrances. */
export const quickOut: Transition = { duration: 0.16, ease: easeOut };
export const iconSwap: Transition = { type: "spring", duration: 0.3, bounce: 0 };

export const blurredOut = { opacity: 0, filter: "blur(4px)" };
export const sharp = { opacity: 1, filter: "blur(0px)" };

/**
 * Background recession: everything but the focused coin washes out and blurs in place.
 * Restoring waits a beat so the breakdown is gone before the list sharpens again.
 */
export function Recede({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <motion.div
      inert={active}
      initial={false}
      animate={active ? { opacity: 0.4, filter: "blur(24px)" } : sharp}
      transition={{ duration: 0.3, ease: easeInOut, delay: active ? 0 : 0.1 }}
    >
      {children}
    </motion.div>
  );
}
