import { AnimatePresence, motion } from "motion/react";
import { FaceIdGlyph, FaceMatchGlyph } from "./glyphs";
import { blurSwap, sheet } from "./motion";

export type HudGlyph = "scan" | "spin" | "match";

const LABEL: Record<HudGlyph, string> = { scan: "Face ID", spin: "Scanning face", match: "Face recognised" };

/** In-app stand-in for the system Face ID HUD. */
export function FaceIdHud({ glyph }: { glyph: HudGlyph }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 grid h-[54%] place-items-center">
      <motion.div
        role="status"
        aria-label={LABEL[glyph]}
        className="grid size-36 place-items-center rounded-[40px] bg-black text-[#5EE486] shadow-[0_0_0_1px_rgb(255_255_255/0.06),0_24px_48px_rgb(0_0_0/0.4)] [perspective:400px] [&_svg]:drop-shadow-[0_0_6px_rgb(94_228_134/0.55)]"
        initial={{ opacity: 0, scale: 0.6, filter: "blur(8px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, scale: 0.6, filter: "blur(8px)" }}
        transition={sheet}
      >
        <AnimatePresence initial={false}>
          <motion.div key={glyph} className="col-start-1 row-start-1" {...blurSwap}>
            {glyph === "scan" && <FaceIdGlyph className="size-[68px] opacity-80" />}
            {glyph === "spin" && (
              <motion.svg
                viewBox="0 0 64 64"
                fill="none"
                stroke="currentColor"
                strokeWidth={4}
                strokeLinecap="round"
                className="size-[72px]"
                animate={{ rotateY: 360 }}
                transition={{ duration: 0.7, ease: "easeInOut", repeat: Infinity }}
                aria-hidden
              >
                {/* four arcs: circumference 176, quarter 44 with an 8 gap */}
                <circle cx={32} cy={32} r={28} strokeDasharray="36 8" transform="rotate(-40 32 32)" />
              </motion.svg>
            )}
            {glyph === "match" && <FaceMatchGlyph className="size-[72px]" />}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
