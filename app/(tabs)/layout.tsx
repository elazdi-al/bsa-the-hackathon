import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { BottomBar } from "./_components/bottom-bar";
import { RequireWallet } from "./_components/wallet";

// The tabs share one persistent bar, so switching tabs never remounts it.
export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <RequireWallet />
      {children}
      <BottomBar />
    </MotionConfig>
  );
}
