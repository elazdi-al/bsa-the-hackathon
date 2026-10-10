import { EnvelopeIcon, ScanSmileyIcon, ShieldCheckIcon, type Icon } from "@phosphor-icons/react";

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
    body: "Your Device Key is protected by Face ID — encrypted and stored on this phone.",
    Icon: ScanSmileyIcon,
    accent: "#0a84ff",
    cta: { idle: "Create Device Key", busy: "Creating Device Key" },
  },
  {
    id: "twofa",
    title: "Swissquote Key",
    body: "Swissquote checks every payment with you and can never move your money alone.",
    Icon: ShieldCheckIcon,
    accent: "#ff5a1f",
    cta: { idle: "Create Swissquote Key", busy: "Creating Swissquote Key" },
  },
  {
    id: "recovery",
    title: "Recovery Key",
    body: "Your Recovery Kit gets you back in if you lose your phone. We alert this email about any recovery.",
    Icon: EnvelopeIcon,
    accent: "#a945e8",
  },
];

export const SETUP = {
  working: { title: "Setting up your wallet", body: "Hold tight while we're getting your wallet ready." },
  ready: { title: "Your wallet is ready!", body: "Linked to your Swissquote account. Save your Recovery Kit and keep it at home." },
} as const;

export const CODE_SENT = "We've sent you a 6-digit code to";
export const CODE_LENGTH = 6;
export const RESEND_SECONDS = 30;
