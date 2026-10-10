"use client";

import { motion, useMotionValue, useReducedMotion, useTransform, type Transition } from "motion/react";
import { IdCard } from "./id-card";

const MAGNIFY = 1.25;
const CYCLE = 4.45;

// Lens centre relative to the card centre, in pt. It rests top-right, top-left and bottom-right
// (drifting a couple of points while it rests) and glides between them, crossing the portrait
// on the diagonal. Times are seconds into the reference loop.
const stops = [
  { at: 0, x: 24, y: -51 },
  { at: 0.47, x: 24, y: -49 },
  { at: 0.9, x: -47, y: -39 },
  { at: 2, x: -45, y: -40 },
  { at: 2.43, x: 34, y: 46 },
  { at: 3.55, x: 32, y: 44 },
  { at: 3.98, x: 24, y: -53 },
  { at: CYCLE, x: 24, y: -51 },
];

// Fitted to the film: a soft start and a long settle, no overshoot.
const glide = [0.25, 0.05, 0.35, 1] as const;

const loop: Transition = {
  duration: CYCLE,
  times: stops.map((s) => s.at / CYCLE),
  ease: ["linear", glide, "linear", glide, "linear", glide, "linear"],
  repeat: Infinity,
};

export function IdentityIllustration() {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(stops[0].x);
  const y = useMotionValue(stops[0].y);
  // The magnified copy counter-moves so it stays fixed under the travelling lens.
  const copyX = useTransform(() => -x.get());
  const copyY = useTransform(() => -y.get());

  return (
    <div className="relative">
      <IdCard />
      <motion.div
        className="absolute top-1/2 left-1/2 size-[120px] -translate-1/2 overflow-hidden rounded-full bg-background shadow-[0_0_0_1.5px_rgb(0_0_0/0.14)]"
        style={{ x, y }}
        animate={reduceMotion ? undefined : { x: stops.map((s) => s.x), y: stops.map((s) => s.y) }}
        transition={loop}
      >
        <motion.div className="absolute top-1/2 left-1/2 -translate-1/2" style={{ x: copyX, y: copyY, scale: MAGNIFY }}>
          <IdCard />
        </motion.div>
      </motion.div>
    </div>
  );
}
