import { motion } from "motion/react";
import type { ReactNode } from "react";
import { sharp } from "@/app/(tabs)/_components/transitions";

// Traced from the coin breakdown clip, so it keeps its own curve rather than a shared token.
const recession = { duration: 0.3, ease: [0.65, 0, 0.35, 1] } as const;

/**
 * Background recession: everything but the focused coin washes out and blurs in place.
 * Restoring waits a beat so the breakdown is gone before the list sharpens again.
 */
export function Recede({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <motion.div
      inert={active}
      initial={false}
      animate={active ? { opacity: 0.4, filter: "blur(24px)" } : { opacity: 1, filter: sharp }}
      transition={{ ...recession, delay: active ? 0 : 0.1 }}
    >
      {children}
    </motion.div>
  );
}
