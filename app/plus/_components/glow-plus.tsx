import { motion } from "motion/react";
import { bloom, breathe } from "./motion";

export function GlowPlus() {
  return (
    <motion.div variants={bloom} aria-hidden className="relative mx-auto mt-9 grid size-14 place-items-center">
      <motion.div
        className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.55),rgb(255_255_255/0.18)_32%,rgb(255_255_255/0.05)_62%,transparent)]"
        animate={{ opacity: [0.6, 1, 0.6], scale: [0.92, 1.04, 0.92] }}
        transition={breathe}
      />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth={3}
        strokeLinecap="round"
        className="relative size-7 [filter:drop-shadow(0_0_3px_#fff)_drop-shadow(0_0_12px_rgb(255_255_255/0.6))]"
      >
        <path d="M12 4v16M4 12h16" />
      </svg>
    </motion.div>
  );
}
