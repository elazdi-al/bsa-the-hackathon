import {
  ArrowDownIcon,
  ArrowsClockwiseIcon,
  BankIcon,
  CreditCardIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  SparkleIcon,
  type Icon,
} from "@phosphor-icons/react";
import { Money } from "../../_components/money";
import type { Kind, Tx } from "../data";

// One scheme: a coloured glyph on a circle tinted with the same colour.
const kinds: Record<Kind, { Icon: Icon; glyph: string; tint: string }> = {
  receive: { Icon: ArrowDownIcon, glyph: "text-[#ef642c]", tint: "bg-[#ef642c]/12" },
  send: { Icon: PaperPlaneTiltIcon, glyph: "text-[#8a52f5]", tint: "bg-[#8a52f5]/12" },
  withdrawal: { Icon: BankIcon, glyph: "text-[#8a52f5]", tint: "bg-[#8a52f5]/12" },
  swap: { Icon: ArrowsClockwiseIcon, glyph: "text-[#2059f2]", tint: "bg-[#2059f2]/12" },
  reward: { Icon: SparkleIcon, glyph: "text-positive", tint: "bg-positive/12" },
  deposit: { Icon: BankIcon, glyph: "text-[#ef642c]", tint: "bg-[#ef642c]/12" },
  card: { Icon: CreditCardIcon, glyph: "text-[#1f1f1f]", tint: "bg-black/[0.06]" },
  membership: { Icon: PlusIcon, glyph: "text-[#1f1f1f]", tint: "bg-black/[0.06]" },
};

export function Glyph({ kind, size }: { kind: Kind; size: number }) {
  const { Icon: I, glyph, tint } = kinds[kind];
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full ${tint} ${glyph}`} style={{ width: size, height: size }}>
      <I weight={kind === "receive" ? "bold" : "fill"} size={size * 0.5} />
    </span>
  );
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
      <Glyph kind={tx.kind} size={40} />
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
