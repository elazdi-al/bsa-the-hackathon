export type Benefit = {
  icon: "bolt" | "bank" | "card";
  title: string;
  body: string;
};

export const benefits: Benefit[] = [
  {
    icon: "bolt",
    title: "Free Transactions",
    body: "Swissquote pays the network fee on every payment, so you never need ETH.",
  },
  {
    icon: "bank",
    title: "Bank Account",
    body: "Receive payments from anyone with a bank account for a 0.1% conversion fee.",
  },
  {
    icon: "card",
    title: "Swissquote Card",
    body: "A virtual Visa debit card to spend stablecoins anywhere, with zero fees.",
  },
];
