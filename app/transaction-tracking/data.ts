export type StepId = "awaiting" | "received" | "payout" | "signed" | "submitted" | "completed";

export type Row = { label: string; value: string };
export type Step = { id: StepId; label: string };

/** What the tracker shows: the mock bank withdrawal below, or a live send (see live-tracking.tsx). */
export type Tracked = {
  title: string;
  usd: number;
  amount: string;
  date: string;
  steps: Step[];
  rows: Row[];
  rail: Row;
  txHash: string;
  networkFee: string;
  feePaidBy: string;
};

export const withdrawal: Tracked & { step: number } = {
  title: "USDC Withdrawal",
  usd: 1508.5,
  amount: "1,508.50 USDC",
  date: "11 March 2025 at 10:07",
  steps: [
    { id: "awaiting", label: "Awaiting Crypto" },
    { id: "received", label: "Received Crypto" },
    { id: "payout", label: "Payout on the way" },
    { id: "completed", label: "Completed" },
  ],
  /** Index into `steps` when the sheet opens. */
  step: 2,
  rows: [
    { label: "To", value: "Revolut ••••1342" },
    { label: "Account owner", value: "Thomas A. Anderson" },
    { label: "Transfer fee", value: "$8.50" },
  ] satisfies Row[],
  rail: { label: "Payment rail", value: "ACH Same Day" },
  txHash: "0x8a55c56a9e65bdd7272062049178313a783f72f5f04276892279affd49ea0c4c",
  networkFee: "Free",
  feePaidBy: "paid by Swissquote",
};

/** A send from the wallet. Face ID approval resolves once it is on-chain. */
export const sendSteps: Step[] = [
  { id: "signed", label: "Signed with Face ID" },
  { id: "submitted", label: "Sent to Base" },
  { id: "completed", label: "Completed" },
];

/** The blurred History list behind the sheet: icon tint, label widths, and whether the amount is incoming (green). */
export const walletRows: { coin: string; name: number; amount: number; change: "up" | "down" | null }[] = [
  { coin: "#e8e0f7", name: 96, amount: 64, change: null },
  { coin: "#dbe3fb", name: 72, amount: 104, change: null },
  { coin: "#e6e6e8", name: 88, amount: 80, change: null },
  { coin: "#f9ddd1", name: 104, amount: 92, change: "up" },
  { coin: "#e8e0f7", name: 120, amount: 96, change: null },
  { coin: "#e6e6e8", name: 80, amount: 84, change: "up" },
  { coin: "#dbe3fb", name: 92, amount: 76, change: null },
];
