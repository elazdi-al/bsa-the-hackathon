export type Benefit = {
  icon: "bolt" | "bank" | "card";
  title: string;
  body: string;
};

export const benefits: Benefit[] = [
  {
    icon: "bolt",
    title: "Free Transactions",
    body: "Use Fuse without paying Solana network fees.",
  },
  {
    icon: "bank",
    title: "Bank Account",
    body: "Receive payments from anyone with a bank account for a 0.1% conversion fee.",
  },
  {
    icon: "card",
    title: "Fuse Card",
    body: "A virtual Visa debit card to spend stablecoins anywhere, with zero fees.",
  },
];
