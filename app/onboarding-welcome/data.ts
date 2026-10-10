import { ChartBarIcon, CircleIcon, CreditCardIcon, HeadCircuitIcon, LightningIcon, type Icon } from "@phosphor-icons/react";

type Word = { label: string; Icon: Icon; color: string };

/** Word wheel, in the order the reference rolls through them. */
export const WORDS: Word[] = [
  { label: "Spend", Icon: CreditCardIcon, color: "#7C4DFF" },
  { label: "Earn", Icon: ChartBarIcon, color: "#FF6B2C" },
  { label: "Save", Icon: CircleIcon, color: "#14B8A6" },
  { label: "Pay", Icon: LightningIcon, color: "#F43F4F" },
  { label: "Invest", Icon: HeadCircuitIcon, color: "#5B7CFA" },
];
