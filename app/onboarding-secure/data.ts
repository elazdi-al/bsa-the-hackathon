import { BankIcon, CloudIcon, FaceIdIcon, KeyIcon, PhoneIcon, RestoreIcon, type Icon } from "@/components/icons";

export type KeyId = "passkey" | "key" | "recovery";

/** The colour the top gradient takes while a step is active. `white` is the final setup screen. */
export type Tone = "blue" | "orange" | "violet" | "white";

export type WalletKey = {
  id: KeyId;
  title: string;
  body: string;
  Icon: Icon;
  /** Accent of the step icon while the step is active. */
  accent: string;
  cta: { idle: string; busy: string };
};

export const KEYS: readonly WalletKey[] = [
  {
    id: "passkey",
    title: "Passkey",
    body: "Face ID approves every payment. Without it, nothing leaves your wallet.",
    Icon: FaceIdIcon,
    accent: "var(--color-sky)",
    cta: { idle: "Create Passkey", busy: "Creating Passkey" },
  },
  {
    id: "key",
    title: "Wallet Key",
    body: "Split between these three, so no one stores it whole. Any two can rebuild it, and payments still need your Passkey.",
    Icon: KeyIcon,
    accent: "var(--color-orange)",
    cta: { idle: "Split Wallet Key", busy: "Splitting Wallet Key" },
  },
  {
    id: "recovery",
    title: "Recovery Key",
    body: "Restores your wallet on a new phone, after an ID check and a 48-hour hold you can cancel. Once saved, keep it at home, off this phone.",
    Icon: RestoreIcon,
    accent: "var(--color-purple)",
    cta: { idle: "Save Recovery Key", busy: "Saving Recovery Key" },
  },
];

/** What a step says when its work fails. The browser's own cancel and timeout text is a spec link, not copy. */
export const FAILED = {
  passkey: "Your passkey wasn't created. Try again.",
  key: "Your Wallet Key wasn't split. Try again.",
  recovery: "Your Recovery Key wasn't saved. Try again.",
  setup: "Your wallet wasn't set up. Try again.",
} as const;

/** Who holds a part of the Wallet Key, in the order the parts land. */
export const HOLDERS: readonly { name: string; Icon: Icon }[] = [
  { name: "This phone", Icon: PhoneIcon },
  { name: "Swissquote", Icon: BankIcon },
  { name: "Independent service", Icon: CloudIcon },
];

export const RECOVERY_FILE = {
  name: "Swissquote Wallet Recovery Key.txt",
  text: (secret: string) =>
    `Swissquote Wallet Recovery Key\n\n${secret}\n\nThis key restores your wallet if you lose your phone. Keep it safe at home, not on your phone. Swissquote will never ask you to send it.`,
};

/** The setup row's copy by status. Setup only idles after a failed registration; the ready body is the wallet's address. */
export const SETUP = {
  working: { title: "Setting up your wallet", body: "Your wallet is registering the public side of your three keys." },
  idle: { title: "Your wallet isn't set up yet", body: "Your three keys are made. Only this last step is left.", cta: "Try Again" },
  ready: { title: "Your wallet is ready" },
} as const;
