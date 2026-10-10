import { AnimatePresence, motion } from "motion/react";
import type { FaceId } from "../flow";
import { blurSwap, easeOut, snap } from "./motion";

const GREEN = "#4cd964";

/** In-app stand-in for the Dynamic Island Face ID animation. */
export function FaceIdHud({ phase }: { phase: FaceId }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center">
      <AnimatePresence>
        {phase !== "hidden" && (
          <motion.div
            role="status"
            aria-label={phase === "success" ? "Face ID confirmed" : "Scanning with Face ID"}
            initial={{ opacity: 0, scale: 0.9, filter: "blur(8px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.94, filter: "blur(6px)" }}
            transition={snap}
            className="grid size-[144px] place-items-center rounded-[40px] bg-black shadow-[0_24px_48px_-12px_rgb(0_0_0/0.35)]"
          >
            <AnimatePresence>{phase === "scanning" ? <ScanRings key="scan" /> : <Check key="check" />}</AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ScanRings() {
  return (
    <motion.div {...blurSwap} className="relative col-start-1 row-start-1 size-16">
      {[0, 0.35].map((delay) => (
        <motion.span
          key={delay}
          className="absolute inset-0 rounded-full border-[3px]"
          style={{ borderColor: GREEN, opacity: delay ? 0.45 : 1 }}
          animate={{ rotateY: [0, 360], rotateX: [18, -18, 18] }}
          transition={{ duration: 1.1, ease: "linear", repeat: Infinity, delay }}
        />
      ))}
    </motion.div>
  );
}

function Check() {
  return (
    <motion.svg
      {...blurSwap}
      width="68"
      height="68"
      viewBox="0 0 68 68"
      fill="none"
      className="col-start-1 row-start-1"
      aria-hidden
    >
      <circle cx="34" cy="34" r="30" stroke={GREEN} strokeWidth="3.5" />
      <motion.path
        d="M22 35l8 8 16-17"
        stroke={GREEN}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: easeOut, delay: 0.1 }}
      />
    </motion.svg>
  );
}
