import type { ReactNode } from "react";
import { tileLooks } from "./asset-tile";

function AppIcon({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span aria-hidden className={`grid size-8 place-items-center rounded-[10px] text-white ${className}`}>
      {children}
    </span>
  );
}

export function UsdcIcon() {
  return (
    <AppIcon className="bg-fuse-blue">
      <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.8}>
        <path d="M9.2 5.3a7.4 7.4 0 0 0 0 13.4M14.8 5.3a7.4 7.4 0 0 1 0 13.4" />
        <path d="M14.1 9.7c-.2-1-1-1.6-2.1-1.6-1.2 0-2.1.7-2.1 1.7 0 2.4 4.3 1.5 4.3 4.1 0 1.1-.9 1.9-2.2 1.9-1.2 0-2.1-.7-2.2-1.7M12 6.9v1.2M12 15.8V17" />
      </svg>
    </AppIcon>
  );
}

export function VisaIcon() {
  return (
    <AppIcon className="bg-ink">
      <span className="text-[9.5px] leading-none font-black tracking-[-0.02em] italic">VISA</span>
    </AppIcon>
  );
}

/** Black Fuse mark with a small plus. */
export function FusePlusIcon() {
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

/** Fuse Earn mark: light streaks across the Earn account's colour. */
export function FuseEarnIcon() {
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
