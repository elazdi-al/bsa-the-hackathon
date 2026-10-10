import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { WORDS } from "../data";
import { roll } from "./motion";

const ROW = 73;
const INTERVAL = 900;
const SLOTS = [-2, -1, 0, 1, 2];
const OPACITY = [1, 0.06, 0.02];
const BLUR = [0, 0.5, 1];

export function WordWheel() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), INTERVAL);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative min-h-[280px] flex-1 overflow-hidden">
      <p className="sr-only">{WORDS.map((w) => w.label).join(", ")}</p>
      <div aria-hidden className="absolute inset-x-0 top-[52px] bottom-0">
        <AnimatePresence initial={false}>
          {SLOTS.map((slot) => {
            // Rows are keyed by absolute position so each word keeps its element as it rolls down.
            const index = tick - slot;
            const word = WORDS[((index % WORDS.length) + WORDS.length) % WORDS.length];
            const distance = Math.abs(slot);
            return (
              <motion.div
                key={index}
                className="absolute inset-x-8 top-1/2 -mt-[36.5px] flex h-[73px] items-center gap-3.5 will-change-transform min-[360px]:inset-x-12"
                initial={{ y: -3 * ROW, opacity: 0, filter: "blur(4px)" }}
                animate={{
                  y: slot * ROW,
                  opacity: OPACITY[distance],
                  filter: [null, "blur(3px)", `blur(${BLUR[distance]}px)`],
                }}
                exit={{ y: 3 * ROW, opacity: 0, filter: "blur(4px)" }}
                transition={roll}
              >
                <motion.span className="shrink-0" animate={{ opacity: distance ? 0.3 : 1 }} transition={roll}>
                  <word.Icon weight="fill" size={40} color={word.color} />
                </motion.span>
                <span className="text-[40px] font-medium tracking-[-0.02em] text-[#111]">{word.label}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
