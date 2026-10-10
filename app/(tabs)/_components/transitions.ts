import type { Transition } from "motion/react";

export const easeOut = [0.23, 1, 0.32, 1] as const;

/** Small UI state changes: pills, presses, menu items. */
export const snappy = { type: "spring", duration: 0.35, bounce: 0 } satisfies Transition;
/** Larger movement: chart bars, cards settling. */
export const smooth = { type: "spring", duration: 0.7, bounce: 0 } satisfies Transition;
/** Blur-in of text and glyphs. */
export const reveal = { duration: 0.45, ease: easeOut } satisfies Transition;
/** Exits are quicker than entrances. */
export const leave = { duration: 0.2, ease: easeOut } satisfies Transition;

export const blurred = "blur(8px)";
export const sharp = "blur(0px)";
