import { BankIcon, BellIcon, CreditCardIcon, CurrencyDollarIcon, EyeSlashIcon, IdentificationCardIcon, LifebuoyIcon, type Icon } from "@phosphor-icons/react";
import { wallet } from "@/app/coin-breakdown/data";
import { KEYS, type KeyId } from "@/app/onboarding-secure/data";
import { ink } from "../_components/glyph";

export const profile = { name: "Thomas A. Anderson", initials: "TA", address: wallet.address };

export const plus = { title: "Fuse Plus", status: "Member", benefits: "Network fees covered, bank account and virtual Visa." };

export type Status = "Active" | "Pending";

/** What pressing a row does. `info` rows don't press, so they get no chevron. */
type Behaviour =
  | { kind: "info"; value?: string }
  | { kind: "tray"; about: string }
  | { kind: "push"; href: string }
  | { kind: "mail"; href: string }
  | { kind: "switch"; on: boolean };

export type Row = Behaviour & { label: string; detail?: string; Icon: Icon; color: string; status?: Status };
export type TrayRow = Extract<Row, { kind: "tray" }>;

// Labels, glyphs and colours come from onboarding, so a key looks the same where it was made.
function key(id: KeyId, detail: string, about: string): Row {
  const { title, Icon, accent } = KEYS.find((k) => k.id === id)!;
  return { kind: "tray", label: title, Icon, color: accent, detail, status: "Active", about };
}

export const sections: { title: string; rows: Row[] }[] = [
  {
    title: "Security",
    rows: [
      key("device", "Face ID on this iPhone", "Encrypted on this phone and unlocked with Face ID. Any two of your three keys approve a payment, so a lost phone alone can’t move your money."),
      key("twofa", "iCloud", "Encrypted in your iCloud. Together with your Device Key, it approves every payment you make."),
      key("recovery", "vova@sqds.io", "If you lose your phone, this key and your 2FA Key get you back into Fuse. We send a code to this email when you use it."),
    ],
  },
  {
    title: "Account",
    rows: [
      { kind: "push", label: "Identity verification", Icon: IdentificationCardIcon, color: "#2059f2", href: "/pending-verification", status: "Pending" },
      { kind: "info", label: "Bank account", Icon: BankIcon, color: "#8a52f5", value: "Revolut ••••1342" },
      { kind: "info", label: "Fuse Card", Icon: CreditCardIcon, color: ink, value: "Virtual Visa" },
    ],
  },
  {
    title: "Preferences",
    rows: [
      { kind: "switch", label: "Hide My Wallet by default", detail: "Send from a fresh address", Icon: EyeSlashIcon, color: "var(--color-fuse-blue)", on: false },
      { kind: "switch", label: "Notifications", Icon: BellIcon, color: "#ef642c", on: true },
      { kind: "info", label: "Currency", Icon: CurrencyDollarIcon, color: "var(--color-positive)", value: "USD" },
    ],
  },
  {
    title: "Support",
    rows: [{ kind: "mail", label: "Help & support", Icon: LifebuoyIcon, color: "#2059f2", href: "mailto:support@fuse.xyz" }],
  },
];

export const version = "Fuse 0.1.0";
