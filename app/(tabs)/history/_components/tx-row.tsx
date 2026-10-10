import {
  ArrowDownIcon,
  ArrowsClockwiseIcon,
  BankIcon,
  CreditCardIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  SparkleIcon,
  type Icon,
  type IconWeight,
} from "@phosphor-icons/react";
import { Glyph, ink } from "../../_components/glyph";
import { Money } from "../../_components/money";
import type { Kind, Tx } from "../data";

// Arrows are drawn bold, as in the quick actions menu; objects are filled.
const kinds: Record<Kind, { Icon: Icon; color: string; weight?: IconWeight }> = {
  receive: { Icon: ArrowDownIcon, color: "#ef642c", weight: "bold" },
  send: { Icon: PaperPlaneTiltIcon, color: "#8a52f5" },
  withdrawal: { Icon: BankIcon, color: "#8a52f5" },
  swap: { Icon: ArrowsClockwiseIcon, color: "#2059f2", weight: "bold" },
  reward: { Icon: SparkleIcon, color: "var(--color-positive)" },
  deposit: { Icon: BankIcon, color: "#ef642c" },
  card: { Icon: CreditCardIcon, color: ink },
  membership: { Icon: PlusIcon, color: ink },
};

export function TxGlyph({ kind, size }: { kind: Kind; size?: number }) {
  return <Glyph {...kinds[kind]} size={size} />;
}

const sign = { in: "+", out: "−", swap: "" } as const;

export function Amount({ tx }: { tx: Tx }) {
  return (
    <>
      {sign[tx.flow]}
      <Money value={tx.usd} />
    </>
  );
}

/** A transaction's glyph, title, subtitle and amount. `when` replaces the time, e.g. with the day outside a dated list. */
export function RowBody({ tx, when = tx.time }: { tx: Tx; when?: string }) {
  return (
    <>
      <TxGlyph kind={tx.kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-5 font-medium">{tx.title}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[13px] leading-[18px] text-[#adadad]">
          <span className="truncate">
            {when} · {tx.detail}
          </span>
          {tx.status === "Pending" && (
            <span className="shrink-0 rounded-full bg-pending/12 px-1.5 py-px text-[11px] font-medium text-pending">Pending</span>
          )}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-[15px] leading-5 font-medium ${tx.flow === "in" ? "text-positive" : ""}`}>
          <Amount tx={tx} />
        </span>
        {tx.crypto && <span className="mt-0.5 block text-[13px] leading-[18px] text-[#adadad] tabular-nums">{tx.crypto}</span>}
      </span>
    </>
  );
}
