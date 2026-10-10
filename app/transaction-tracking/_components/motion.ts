import type { Transition } from "motion/react";

/** Sheet height, tracker fold and the shared status morph. Critically damped: nothing bounces. */
export const settle: Transition = { type: "spring", visualDuration: 0.35, bounce: 0 };

/** Exits leave faster than things arrive. */
export const leave: Transition = { type: "spring", visualDuration: 0.2, bounce: 0 };

/** Icon and word swaps. */
export const swap: Transition = { type: "spring", duration: 0.3, bounce: 0 };

export const sharp = { opacity: 1, filter: "blur(0px)", scale: 1, y: 0 };
export const blurred = { opacity: 0, filter: "blur(4px)" };
