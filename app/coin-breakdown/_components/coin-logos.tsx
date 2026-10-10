import type { ReactNode } from "react";
import type { CoinId } from "../data";

const white = { fill: "none", stroke: "#fff", strokeLinecap: "round", strokeLinejoin: "round" } as const;

const marks: Record<CoinId, ReactNode> = {
  sol: (
    <>
      <circle cx="21" cy="21" r="21" fill="#000" />
      <g fill="#fff" transform="translate(11.4 13.5) scale(0.048)">
        <path d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1z" />
        <path d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1z" />
        <path d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1z" />
      </g>
    </>
  ),
  usdc: (
    <>
      <circle cx="21" cy="21" r="21" fill="#2775ca" />
      <g {...white} strokeWidth="1.8">
        <path d="M15.9 12.2a10.2 10.2 0 0 0 0 17.6M26.1 12.2a10.2 10.2 0 0 1 0 17.6" />
        <path d="M24.1 17.8c-.3-1.4-1.5-2.2-3.1-2.2-1.8 0-3 .9-3 2.2 0 3.1 6.3 1.8 6.3 5.3 0 1.4-1.3 2.4-3.2 2.4-1.7 0-3-.7-3.3-2.1M21 13.6v2M21 25.5v2.2" />
      </g>
    </>
  ),
  pyusd: (
    <>
      <circle cx="21" cy="21" r="21" fill="#1a6fd6" />
      <circle cx="21" cy="21" r="17.2" {...white} strokeWidth="1.1" />
      <path
        {...white}
        strokeWidth="1.5"
        d="M18.2 10.8h6.6c3.6 0 5.6 2 5.6 5 0 3.9-2.9 6.4-6.9 6.4h-2.9l-1.2 7.6h-3.6zM12.4 15.2h7.4M11.8 18.8h7.4"
      />
    </>
  ),
  jto: (
    <>
      <circle cx="21" cy="21" r="21" fill="#000" />
      <circle cx="21" cy="21" r="16.6" {...white} strokeWidth="1.4" />
      <path {...white} strokeWidth="2" d="M13.5 13.5Q21 21.6 28.5 13.5Q20.4 21 28.5 28.5Q21 20.4 13.5 28.5Q21.6 21 13.5 13.5z" />
    </>
  ),
  jup: (
    <>
      <defs>
        <linearGradient id="jup-stripes" gradientUnits="userSpaceOnUse" x1="32" y1="9" x2="10" y2="33">
          <stop offset="0.15" stopColor="#d3f28e" />
          <stop offset="0.85" stopColor="#1fb9d9" />
        </linearGradient>
        <clipPath id="jup-disc">
          <circle cx="21" cy="21" r="15.5" />
        </clipPath>
      </defs>
      <circle cx="21" cy="21" r="21" fill="#141a24" />
      <g clipPath="url(#jup-disc)" fill="none" stroke="url(#jup-stripes)" strokeWidth="2.8" strokeLinecap="round">
        {[9, 14, 19, 24, 29].map((r) => (
          <circle key={r} cx="7" cy="37" r={r} />
        ))}
      </g>
    </>
  ),
  tnsr: (
    <>
      <circle cx="21" cy="21" r="21" fill="#000" />
      <path fill="#fff" d="M20.2 10.2V32l-3.2-2.6V18.4l-5 4.6-1.9-1.5zM21.8 10.2V32l3.2-2.6V18.4l5 4.6 1.9-1.5z" />
    </>
  ),
};

export function CoinLogo({ id }: { id: CoinId }) {
  return (
    <svg viewBox="0 0 42 42" className="size-full" aria-hidden>
      {marks[id]}
    </svg>
  );
}
