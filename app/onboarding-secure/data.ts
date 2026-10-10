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
    body: "Split between these three, so nobody holds it whole. Any two can sign.",
    Icon: KeyIcon,
    accent: "var(--color-orange)",
    cta: { idle: "Split Wallet Key", busy: "Splitting Wallet Key" },
  },
  {
    id: "recovery",
    title: "Recovery Key",
    body: "Restores your wallet if you lose this phone, after a 48-hour hold you can cancel. Keep it off this phone.",
    Icon: RestoreIcon,
    accent: "var(--color-purple)",
    cta: { idle: "Save Recovery Key", busy: "Saving Recovery Key" },
  },
];

/** Who holds a part of the Wallet Key, in the order the parts land. */
export const HOLDERS: readonly { name: string; Icon: Icon }[] = [
  { name: "This phone", Icon: PhoneIcon },
  { name: "Swissquote", Icon: BankIcon },
  { name: "Backup service", Icon: CloudIcon },
];

export const RECOVERY_FILE = {
  name: "Fuse Recovery Key.txt",
  text: (secret: string) =>
    `Fuse Recovery Key\n\n${secret}\n\nThis key restores your wallet if you lose your phone. Keep it somewhere other than your phone. Swissquote will never ask for it.`,
  failed: "Your Recovery Key wasn't saved. Try again.",
};

/** The setup row's copy by status. Setup only idles after a failed registration; the ready body is the wallet's address. */
export const SETUP = {
  working: { title: "Setting up your wallet", body: "Your wallet is registering the public side of your three keys." },
  idle: { title: "Your wallet isn't set up yet", body: "Your three keys are made. Only this last step is left.", cta: "Try Again" },
  ready: { title: "Your wallet is ready" },
} as const;
