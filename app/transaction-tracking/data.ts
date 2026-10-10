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
