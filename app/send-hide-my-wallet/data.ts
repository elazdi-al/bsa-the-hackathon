import { EyeSlashIcon, LightningIcon, WalletIcon } from "@phosphor-icons/react/ssr";

export const transfer = {
  amount: { whole: "$250", cents: ".00" },
  token: "250.00 USDC",
};

export const recipient = {
  name: "Solana wallet",
  wallet: "Ledger",
  avatar: "🏀",
  sends: 4,
};

export const hideMyWalletWords = ["with", "Hide", "My", "Wallet"] as const;

export const howItWorks = [
  {
    icon: WalletIcon,
    title: "A fresh address",
    body: "Each private send leaves from a new one-time address.",
  },
  {
    icon: EyeSlashIcon,
    title: "Nothing to trace back",
    body: "The recipient sees that address, never your wallet, balance or history.",
  },
  {
    icon: LightningIcon,
    title: "Still covered",
    body: "Fuse⁺ pays the onchain fees, like any other send.",
  },
] as const;
