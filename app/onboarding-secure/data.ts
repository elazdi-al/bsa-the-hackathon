import { CloudIcon, EnvelopeIcon, FaceIdIcon, type Icon } from "@/components/icons";

export type KeyId = "device" | "twofa" | "recovery";

/** The colour the top gradient takes while a step is active. `white` is the final setup screen. */
export type Tone = "blue" | "orange" | "violet" | "white";

export type WalletKey = {
  id: KeyId;
  title: string;
  body: string;
  Icon: Icon;
  /** Accent of the step icon while the step is active. */
  accent: string;
  cta?: { idle: string; busy: string };
};

export const KEYS: readonly WalletKey[] = [
  {
    id: "device",
    title: "Device Key",
    body: "Your Device Key is protected by biometric verification — encrypted and stored on your phone.",
    Icon: FaceIdIcon,
    accent: "var(--color-sky)",
    cta: { idle: "Create Device Key", busy: "Creating Device Key" },
  },
  {
    id: "twofa",
    title: "2FA Key",
    body: "Your 2FA Key adds a second layer of protection — encrypted and stored in iCloud.",
    Icon: CloudIcon,
    accent: "var(--color-orange)",
    cta: { idle: "Create 2FA Key", busy: "Creating 2FA Key" },
  },
  {
    id: "recovery",
    title: "Recovery Key",
    body: "Your Recovery Key helps you regain access to Fuse if you lose your phone.",
    Icon: EnvelopeIcon,
    accent: "var(--color-purple)",
  },
];

export const SETUP = {
  working: { title: "Setting up your wallet", body: "Hold tight while we're getting your wallet ready." },
  ready: { title: "Your wallet is ready!", body: "You now have safe place for your money." },
} as const;

export const CODE_SENT = "We've sent you a 6-digit code to";
export const CODE_LENGTH = 6;
export const RESEND_SECONDS = 30;
