export type Benefit = {
  icon: "bolt" | "bank" | "card";
  title: string;
  body: string;
};

export const benefits: Benefit[] = [
  {
    icon: "bolt",
    title: "Instant Payments",
    body: "Payments settle on Base in seconds, and Swissquote pays the network fee, as it does for every client.",
  },
  {
    icon: "bank",
    title: "Bank Account",
    body: "Receive bank transfers from anyone, converted to USDC for a 0.1% fee.",
  },
  {
    icon: "card",
    title: "Swissquote Card",
    body: "A virtual Visa debit card to spend your USDC anywhere Visa is accepted, with no card fees.",
  },
];
