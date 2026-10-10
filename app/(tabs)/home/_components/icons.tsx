import type { ReactNode } from "react";
import { SwissquoteMark } from "@/components/swissquote-mark";
import { tileLooks } from "./asset-tile";

function AppIcon({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span aria-hidden className={`grid size-8 place-items-center rounded-[10px] text-white ${className}`}>
      {children}
    </span>
  );
}

/** Swissquote Plus: Swissquote's own mark. */
export function PlusAppIcon() {
  return <SwissquoteMark size={32} className="shrink-0" />;
}

/** Earn mark: light streaks across the Earn account's colour. */
export function EarnAppIcon() {
  return (
    <AppIcon className={`overflow-hidden ${tileLooks.earn.fill}`}>
      <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M-1 17c7-1.5 12-7 26-10" strokeWidth={2.4} strokeOpacity={0.95} />
        <path d="M-1 19.4c7-1.5 12-7 26-10" strokeWidth={1.4} strokeOpacity={0.55} />
        <path d="M-1 21.4c7-1.5 12-7 26-10" strokeWidth={1} strokeOpacity={0.3} />
      </svg>
    </AppIcon>
  );
}
