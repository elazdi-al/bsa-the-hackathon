import type { ReactNode } from "react";
import { KEYS, type KeyId } from "@/app/onboarding-secure/data";
import { BankIcon, BellIcon, CoinIcon, HelpIcon, KeyIcon, LightningIcon, LockIcon, SignOutIcon, SparkleIcon, type Icon } from "@/components/icons";
import type { TileId } from "../home/data";

export type { KeyId };

/** The trays a row can open; each is the root of its own view stack. */
export type TrayRoot = "keys" | "link" | "remove" | "unlocked";

/** What pressing a row does. `info` rows don't press, so they get no chevron. */
type Behaviour =
  | { kind: "info"; value: ReactNode }
  | { kind: "tray"; opens: TrayRoot }
  | { kind: "link"; href: string }
  | { kind: "switch"; on: boolean };

export type Row = Behaviour & { label: string; detail?: ReactNode; demo?: true; Icon: Icon; destructive?: boolean };

const about: Record<KeyId, { detail: string; about: string }> = {
  passkey: { detail: "Face ID on this phone", about: "Approves every payment you make. Without it, nothing leaves your wallet." },
  key: {
    detail: "Phone, Swissquote and an independent service",
    about: "This phone, Swissquote and an independent service each hold one part, so no one stores it whole. Any two can rebuild it, and payments still need your Passkey, which only this phone has.",
  },
  recovery: {
    detail: "Saved as a file",
    about: "Restores your wallet if you lose this phone, after a 48-hour hold you can cancel. Keep it at home; Swissquote never needs to see it.",
  },
};

// Labels, glyphs and colours come from onboarding, so a key looks the same where it was made.
export const keys = KEYS.map(({ id, title, Icon, accent }) => ({ id, title, Icon, accent, ...about[id] }));

/** What linking a Swissquote account adds, in the link tray. */
export const linkAdds: { Icon: Icon; text: string }[] = [
  { Icon: BankIcon, text: "Move money between your Swissquote account and this wallet without extra checks." },
  { Icon: LightningIcon, text: "Swissquote pays your network fees, so your wallet needs no ETH." },
  { Icon: LockIcon, text: "Swissquote can lock this phone if it's lost or stolen." },
  { Icon: SparkleIcon, text: "Unlocks Swissquote's services: Investments, Swap, Earn, Staking, Borrowing and Card." },
];

/** What linking unlocks, told once the link is made: Swissquote's services, each in its Home tile's colours. All demos. */
export const unlocks: { id: Exclude<TileId, "cash"> | "swap"; label: string; text: string }[] = [
  { id: "investments", label: "Investments", text: "Trade stocks, ETFs and crypto." },
  { id: "swap", label: "Swap", text: "Swap between your coins." },
  { id: "earn", label: "Earn", text: "Interest on your USDC." },
  { id: "staking", label: "Staking", text: "Rewards for staking your ETH." },
  { id: "borrowing", label: "Borrowing", text: "Borrow USDC against your investments." },
  { id: "card", label: "Card", text: "A virtual Visa card for your USDC." },
];

/** Groups of rows, set apart by space alone. */
export const sections: Row[][] = [
  [
    { kind: "tray", opens: "keys", label: "Keys", Icon: KeyIcon },
  ],
  [
    { kind: "switch", label: "Notifications", Icon: BellIcon, on: true, demo: true },
    { kind: "info", label: "Currency", Icon: CoinIcon, value: "USD" },
  ],
  [
    { kind: "link", label: "Help & support", Icon: HelpIcon, href: "https://www.swissquote.com/en-ch/private/help" },
    { kind: "tray", opens: "remove", label: "Remove from this phone", Icon: SignOutIcon, destructive: true },
  ],
];

export const version = "Swissquote Wallet 0.1.0";
