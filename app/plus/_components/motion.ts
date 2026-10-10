import { stagger, type Transition, type Variants } from "motion/react";
import { blurred, reveal, sharp, smooth } from "@/app/(tabs)/_components/transitions";

export const sequence: Variants = {
  hidden: {},
  shown: { transition: { delayChildren: stagger(0.07, { startDelay: 0.05 }) } },
};

export const rise: Variants = {
  hidden: { opacity: 0, y: 10, filter: blurred },
  shown: { opacity: 1, y: 0, filter: sharp, transition: reveal },
};

export const bloom: Variants = {
  hidden: { opacity: 0, scale: 0.85, filter: blurred },
  shown: { opacity: 1, scale: 1, filter: sharp, transition: reveal },
};

// The section itself only fades up; blurring a block this large is costly, so its rows carry the blur.
export const surface: Variants = {
  hidden: { opacity: 0, y: 16 },
  shown: {
    opacity: 1,
    y: 0,
    transition: { ...smooth, delayChildren: stagger(0.06, { startDelay: 0.08 }) },
  },
};

export const breathe: Transition = { duration: 4.8, ease: "easeInOut", repeat: Infinity };
