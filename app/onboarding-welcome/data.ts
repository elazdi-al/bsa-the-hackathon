import { CardIcon, ChartIcon, CoinsIcon, LightningIcon, PercentIcon, type Icon } from "@/components/icons";

type Word = { label: string; Icon: Icon; color: string };

/** Word wheel, in the order the reference rolls through them. */
export const WORDS: Word[] = [
  { label: "Spend", Icon: CardIcon, color: "var(--color-purple)" },
  { label: "Earn", Icon: ChartIcon, color: "var(--color-orange)" },
  { label: "Save", Icon: CoinsIcon, color: "var(--color-positive)" },
  { label: "Pay", Icon: LightningIcon, color: "var(--color-negative)" },
  { label: "Invest", Icon: PercentIcon, color: "var(--color-brand)" },
];
