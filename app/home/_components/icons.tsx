import type { ReactNode } from "react";
import type { TileId } from "../data";

function AppIcon({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span aria-hidden className={`grid size-8 place-items-center rounded-[10px] text-white ${className}`}>
      {children}
    </span>
  );
}

function UsdcIcon() {
  return (
    <AppIcon className="bg-[#4a88fa]">
      <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.8}>
        <path d="M9.2 5.3a7.4 7.4 0 0 0 0 13.4M14.8 5.3a7.4 7.4 0 0 1 0 13.4" />
        <path d="M14.1 9.7c-.2-1-1-1.6-2.1-1.6-1.2 0-2.1.7-2.1 1.7 0 2.4 4.3 1.5 4.3 4.1 0 1.1-.9 1.9-2.2 1.9-1.2 0-2.1-.7-2.2-1.7M12 6.9v1.2M12 15.8V17" />
      </svg>
    </AppIcon>
  );
}

// A halftone disc: dots shrink towards the rim.
const halftone = Array.from({ length: 49 }, (_, i) => ({ x: (i % 7) - 3, y: Math.floor(i / 7) - 3 }))
  .map((p) => ({ ...p, d: Math.hypot(p.x, p.y) }))
  .filter((p) => p.d <= 3.3);

function InvestmentsIcon() {
  return (
    <AppIcon className="bg-[#f88854]">
      <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
        {halftone.map(({ x, y, d }) => (
          <circle key={`${x},${y}`} cx={12 + x * 2.1} cy={12 + y * 2.1} r={0.55 + 0.35 * (1 - d / 3.3)} />
        ))}
      </svg>
    </AppIcon>
  );
}

function EarnIcon() {
  return (
    <AppIcon className="bg-[#904af6]">
      <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
        <rect x="6.3" y="12.6" width="2.6" height="5.2" rx="1.3" />
        <rect x="10.7" y="6.4" width="2.6" height="11.4" rx="1.3" />
        <rect x="15.1" y="9.6" width="2.6" height="8.2" rx="1.3" />
      </svg>
    </AppIcon>
  );
}

function VisaIcon() {
  return (
    <AppIcon className="bg-[#1f1f1f]">
      <span className="text-[9.5px] leading-none font-black tracking-[-0.02em] italic">VISA</span>
    </AppIcon>
  );
}

export const tileIcons: Record<TileId, () => ReactNode> = {
  cash: UsdcIcon,
  investments: InvestmentsIcon,
  earn: EarnIcon,
  card: VisaIcon,
};

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

/** Blue Fuse Earn mark: light streaks across a blue tile. */
export function FuseEarnIcon() {
  return (
    <AppIcon className="overflow-hidden bg-[#437af8]">
      <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M-1 17c7-1.5 12-7 26-10" strokeWidth={2.4} strokeOpacity={0.95} />
        <path d="M-1 19.4c7-1.5 12-7 26-10" strokeWidth={1.4} strokeOpacity={0.55} />
        <path d="M-1 21.4c7-1.5 12-7 26-10" strokeWidth={1} strokeOpacity={0.3} />
      </svg>
    </AppIcon>
  );
}

/** Front-on glasses for the empty promo tile (Phosphor's Eyeglasses is drawn side-on). */
export function GlassesIcon() {
  return (
    <svg aria-hidden viewBox="0 0 32 14" className="mt-2 h-3.5 w-8" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <circle cx="9" cy="7" r="4.6" />
      <circle cx="23" cy="7" r="4.6" />
      <path d="M13.6 6.2q2.4-1.4 4.8 0M4.4 6H1.4M27.6 6h3" />
    </svg>
  );
}
