export type StepId = "awaiting" | "received" | "payout" | "completed";

export type Row = { label: string; value: string };

export const steps: { id: StepId; label: string }[] = [
  { id: "awaiting", label: "Awaiting Crypto" },
  { id: "received", label: "Received Crypto" },
  { id: "payout", label: "Payout on the way" },
  { id: "completed", label: "Completed" },
];

export const withdrawal = {
  title: "USDC Withdrawal",
  amount: "1,508.50 USDC",
  date: "11 March 2025 at 10:07",
  /** Index into `steps` when the sheet opens. */
  step: 2,
  rows: [
    { label: "To", value: "Revolut ••••1342" },
    { label: "Account owner name", value: "Thomas A. Anderson" },
    { label: "Transfer fee", value: "$8.50" },
  ] satisfies Row[],
  paymentRail: "ACH Same Day",
  txHash: "3W4gk9VhQ2nRrT7mXcLp8sYdA5bE1fJu6oZiN4wKq3HtMz5xH",
  networkFee: "Free",
};

/** The blurred wallet behind the sheet: coin colour, label widths, and the sign of the 24h change. */
export const walletRows: { coin: string; name: number; amount: number; change: "up" | "down" | null }[] = [
  { coin: "#7b8bb0", name: 64, amount: 88, change: "up" },
  { coin: "#2775ca", name: 72, amount: 104, change: null },
  { coin: "#4f7fd6", name: 84, amount: 112, change: null },
  { coin: "#9aa4b2", name: 40, amount: 80, change: "up" },
  { coin: "#2775ca", name: 56, amount: 92, change: "up" },
  { coin: "#b8a48a", name: 60, amount: 96, change: "down" },
  { coin: "#8c9099", name: 52, amount: 84, change: "up" },
];
