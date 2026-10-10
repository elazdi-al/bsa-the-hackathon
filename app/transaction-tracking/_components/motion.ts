import { leave, smooth, snappy } from "@/app/(tabs)/_components/transitions";

/** Sheet height, tracker fold and the shared status morph. */
export const settle = smooth;

/** Word swaps. */
export const swap = snappy;

export { leave };

export const sharp = { opacity: 1, filter: "blur(0px)", scale: 1, y: 0 };
