import { leave, sharp } from "@/app/(tabs)/_components/transitions";

export const blurSwap = {
  initial: { opacity: 0, filter: "blur(6px)" },
  animate: { opacity: 1, filter: sharp },
  exit: { opacity: 0, filter: "blur(6px)" },
  transition: leave,
};
