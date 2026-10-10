import { wallet } from "@/app/coin-breakdown/data";
import { KEYS, type KeyId } from "@/app/onboarding-secure/data";
import { BellIcon, CoinIcon, HelpIcon, KeyIcon, SignOutIcon, type Icon } from "@/components/icons";

export type { KeyId };

export const profile = { name: "Thomas A. Anderson", address: wallet.address };

/** The trays a row can open; each is the root of its own view stack. */
export type TrayRoot = "keys" | "signout";

/** What pressing a row does. `info` rows don't press, so they get no chevron. */
type Behaviour =
  | { kind: "info"; value: string }
  | { kind: "tray"; opens: TrayRoot }
  | { kind: "push"; href: string }
  | { kind: "mail"; href: string }
  | { kind: "switch"; on: boolean };

export type Row = Behaviour & { label: string; detail?: string; Icon: Icon; destructive?: boolean };

const about: Record<KeyId, { detail: string; about: string }> = {
  passkey: { detail: "Face ID on this iPhone", about: "Approves every payment you make. Without it, nothing leaves your wallet." },
  key: {
    detail: "Phone, Swissquote and an independent service",
    about: "This phone, Swissquote and an independent service each hold one part. Any two can rebuild it, and payments still need your Passkey, which only this phone has.",
  },
  recovery: {
    detail: "Saved as a file",
    about: "Restores your wallet if you lose this phone, after a 48-hour hold you can cancel. Keep it at home; Swissquote never needs to see it.",
  },
};

// Labels, glyphs and colours come from onboarding, so a key looks the same where it was made.
export const keys = KEYS.map(({ id, title, Icon, accent }) => ({ id, title, Icon, accent, ...about[id] }));

/** Groups of rows, set apart by space alone. */
export const sections: Row[][] = [
  [
    { kind: "tray", opens: "keys", label: "Keys", Icon: KeyIcon },
  ],
  [
    { kind: "switch", label: "Notifications", Icon: BellIcon, on: true },
    { kind: "info", label: "Currency", Icon: CoinIcon, value: "USD" },
  ],
  [
    { kind: "mail", label: "Help & support", Icon: HelpIcon, href: "mailto:support@fuse.xyz" },
    { kind: "tray", opens: "signout", label: "Sign out", Icon: SignOutIcon, destructive: true },
  ],
];

export const version = "Fuse 0.1.0";
