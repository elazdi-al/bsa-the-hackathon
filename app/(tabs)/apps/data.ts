import type { StaticImageData } from "next/image";
import aave from "./icons/aave.png";
import aerodrome from "./icons/aerodrome.png";
import cow from "./icons/cow.png";
import hyperliquid from "./icons/hyperliquid.png";
import lido from "./icons/lido.png";
import revoke from "./icons/revoke.png";

/** A dApp the Apps tab features. Each one's site lets the wallet frame it. */
export type DApp = { id: string; name: string; about: string; url: string; icon: StaticImageData };

export const dapps: DApp[] = [
  { id: "aave", name: "Aave", about: "Lend and borrow crypto", url: "https://app.aave.com", icon: aave },
  { id: "cow", name: "CoW Swap", about: "Swap at the best price", url: "https://swap.cow.fi", icon: cow },
  { id: "lido", name: "Lido", about: "Stake ETH and keep it liquid", url: "https://stake.lido.fi", icon: lido },
  { id: "aerodrome", name: "Aerodrome", about: "Trade and earn on Base", url: "https://aerodrome.finance/swap", icon: aerodrome },
  { id: "hyperliquid", name: "Hyperliquid", about: "Trade perpetuals", url: "https://app.hyperliquid.xyz/trade", icon: hyperliquid },
  { id: "revoke", name: "Revoke", about: "Clean up token approvals", url: "https://revoke.cash", icon: revoke },
];
