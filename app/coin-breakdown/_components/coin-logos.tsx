import type { ReactNode } from "react";
import type { CoinId } from "../data";

const white = { fill: "none", stroke: "#fff", strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** The side arcs of Circle's USDC and EURC marks. */
const sideArcs = "M15.9 12.2a10.2 10.2 0 0 0 0 17.6M26.1 12.2a10.2 10.2 0 0 1 0 17.6";

/** One tapered band of the Aerodrome ribbon; the logo stacks it four times. */
const aeroStripe =
  "M31.29 7.35C19.19 9.36 9.31 14.93 9.31 18.89C9.34 22.63 17.16 25.45 30.58 25.75A0.7 0.7 0 0 0 30.63 24.34C17.21 23.76 11.38 22.63 11.42 18.89C11.42 14.93 19.57 11.69 31.68 9.74A1.21 1.21 0 0 0 31.29 7.35Z";

const marks: Record<CoinId, ReactNode> = {
  usdc: (
    <>
      <circle cx="21" cy="21" r="21" fill="#2775ca" />
      <g {...white} strokeWidth="1.8">
        <path d={sideArcs} />
        <path d="M24.1 17.8c-.3-1.4-1.5-2.2-3.1-2.2-1.8 0-3 .9-3 2.2 0 3.1 6.3 1.8 6.3 5.3 0 1.4-1.3 2.4-3.2 2.4-1.7 0-3-.7-3.3-2.1M21 13.6v2M21 25.5v2.2" />
      </g>
    </>
  ),
  eth: (
    <>
      <circle cx="21" cy="21" r="21" fill="#627EEA" />
      <g fill="#fff" transform="scale(1.3125)">
        <path fillOpacity=".602" d="M16.498 4v8.87l7.497 3.35z" />
        <path d="M16.498 4L9 16.22l7.498-3.35z" />
        <path fillOpacity=".602" d="M16.498 21.968v6.027L24 17.616z" />
        <path d="M16.498 27.995v-6.028L9 17.616z" />
        <path fillOpacity=".2" d="M16.498 20.573l7.497-4.353-7.497-3.348z" />
        <path fillOpacity=".602" d="M9 16.22l7.498 4.353v-7.701z" />
      </g>
    </>
  ),
  eurc: (
    <>
      <circle cx="21" cy="21" r="21" fill="#2775ca" />
      <g {...white} strokeWidth="1.8">
        <path d={sideArcs} />
        <path d="M25.96 16.94A4.6 5.3 0 1 0 25.96 25.06M16 19.5h6.8M16 22.5h6.8" />
      </g>
    </>
  ),
  cbbtc: (
    <>
      <circle cx="21" cy="21" r="21" fill="#fff" />
      <circle cx="21" cy="21" r="19.4" fill="none" stroke="#0052ff" strokeWidth="1.7" />
      <path
        fill="#0052ff"
        transform="scale(1.3125)"
        d="M23.189 14.02c.314-2.096-1.283-3.223-3.465-3.975l.708-2.84-1.728-.43-.69 2.765c-.454-.114-.92-.22-1.385-.326l.695-2.783L15.596 6l-.708 2.839c-.376-.086-.746-.17-1.104-.26l.002-.009-2.384-.595-.46 1.846s1.283.294 1.256.312c.7.175.826.638.805 1.006l-.806 3.235c.048.012.11.03.18.057l-.183-.045-1.13 4.532c-.086.212-.303.531-.793.41.018.025-1.256-.313-1.256-.313l-.858 1.978 2.25.561c.418.105.828.215 1.231.318l-.715 2.872 1.727.43.708-2.84c.472.127.93.245 1.378.357l-.706 2.828 1.728.43.715-2.866c2.948.558 5.164.333 6.097-2.333.752-2.146-.037-3.385-1.588-4.192 1.13-.26 1.98-1.003 2.207-2.538zm-3.95 5.538c-.533 2.147-4.148.986-5.32.695l.95-3.805c1.172.293 4.929.872 4.37 3.11zm.535-5.569c-.487 1.953-3.495.96-4.47.717l.86-3.45c.975.243 4.118.696 3.61 2.733z"
      />
    </>
  ),
  aero: (
    <>
      <circle cx="21" cy="21" r="21" fill="#ece8e1" />
      {["#15172e", "#1f3cff", "#9daaff", "#ff2a1a"].map((fill, i) => (
        <path key={fill} fill={fill} d={aeroStripe} transform={`translate(0 ${i * 2.97})`} />
      ))}
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
