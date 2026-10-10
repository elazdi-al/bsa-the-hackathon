import type { ReactNode } from "react";
import { tileLooks } from "./asset-tile";

function AppIcon({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span aria-hidden className={`grid size-8 place-items-center rounded-[10px] text-white ${className}`}>
      {children}
    </span>
  );
}

/** Black mark with a small plus. */
export function PlusAppIcon() {
  return (
    <AppIcon className="bg-black">
      <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" stroke="currentColor" strokeLinecap="round">
        <path d="M8.2 7.8h7.6M8.2 7.8v7.6" strokeWidth={2.4} fill="none" />
        <circle cx="8.2" cy="7.8" r="2.5" stroke="none" />
        <circle cx="15.8" cy="7.8" r="2.1" stroke="none" />
        <circle cx="8.2" cy="15.6" r="2.3" stroke="none" />
        <path d="M15.8 13.6v4M13.8 15.6h4" strokeWidth={1.4} fill="none" />
      </svg>
    </AppIcon>
  );
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
