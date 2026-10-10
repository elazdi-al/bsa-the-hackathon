import { stagger, type Transition, type Variants } from "motion/react";

const settle: Transition = { type: "spring", duration: 0.7, bounce: 0 };

export const sequence: Variants = {
  hidden: {},
  shown: { transition: { delayChildren: stagger(0.07, { startDelay: 0.05 }) } },
};

export const rise: Variants = {
  hidden: { opacity: 0, y: 10, filter: "blur(6px)" },
  shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: settle },
};

export const bloom: Variants = {
  hidden: { opacity: 0, scale: 0.85, filter: "blur(10px)" },
  shown: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { ...settle, duration: 0.9 } },
};

// The card itself only fades up; blurring a surface this large is costly, so its rows carry the blur.
export const surface: Variants = {
  hidden: { opacity: 0, y: 16 },
  shown: {
    opacity: 1,
    y: 0,
    transition: { ...settle, delayChildren: stagger(0.06, { startDelay: 0.08 }) },
  },
};

export const breathe: Transition = { duration: 4.8, ease: "easeInOut", repeat: Infinity };
