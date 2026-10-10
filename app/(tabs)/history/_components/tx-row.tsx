import { BankIcon, CardIcon, PlusIcon, ReceiveIcon, SendIcon, SparkleIcon, SwapIcon, type Icon } from "@/components/icons";
import { Money } from "../../_components/money";
import type { Kind, Tx } from "../data";

/** Each kind's glyph, and the colour the + menu draws it in. Transaction lists draw every glyph in ink: there, colour only marks money coming in. */
export const kinds = {
  receive: { Icon: ReceiveIcon, text: "text-positive" },
  deposit: { Icon: BankIcon, text: "text-positive" },
  reward: { Icon: SparkleIcon, text: "text-orange" },
  send: { Icon: SendIcon, text: "text-purple" },
  withdrawal: { Icon: BankIcon, text: "text-purple" },
  swap: { Icon: SwapIcon, text: "text-fuse-blue" },
  card: { Icon: CardIcon, text: "text-ink" },
  membership: { Icon: PlusIcon, text: "text-ink" },
} satisfies Record<Kind, { Icon: Icon; text: string }>;

const glyphSizes = {
  // As tall as the row's two lines (22 + 2 + 20), so the disc and the text share a top and a bottom.
  row: { box: "size-11 text-heading", icon: 24 },
  hero: { box: "size-14 text-title", icon: 32 },
} as const;

/** A grey disc with the kind's glyph. A card payment shows the merchant's initial instead: every card row would otherwise wear the same card. */
export function Glyph({ tx, size = "row" }: { tx: Tx; size?: keyof typeof glyphSizes }) {
  const { Icon: I } = kinds[tx.kind];
  const { box, icon } = glyphSizes[size];
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full bg-secondary text-ink ${box}`}>
      {tx.kind === "card" ? tx.title[0] : <I size={icon} />}
    </span>
  );
}

/** Spending reads as a plain amount; only money coming in gets a sign, and the green. */
export function Amount({ tx }: { tx: Tx }) {
  return (
    <>
      {tx.flow === "in" && "+"}
      <Money value={tx.usd} />
    </>
  );
}

/**
 * A transaction's glyph, then two lines that share baselines: title and amount, subtitle and token amount. The amount
 * always sits on the title's line, with or without a token line under it. `when` leads the subtitle, e.g. with the day
 * outside a dated list; a pending status takes its place.
 */
export function RowBody({ tx, when }: { tx: Tx; when?: string }) {
  const lead = tx.status === "Pending" ? <span className="font-semibold text-pending">Pending</span> : when;
  return (
    <>
      <Glyph tx={tx} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-3 text-label">
          <span className="min-w-0 flex-1 line-clamp-2 text-pretty">{tx.title}</span>
          <span className={`shrink-0 tabular-nums ${tx.flow === "in" ? "text-positive" : ""}`}>
            <Amount tx={tx} />
          </span>
        </span>
        <span className="mt-0.5 flex items-baseline gap-3 text-body text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            {lead && <>{lead} · </>}
            {tx.detail}
          </span>
          {tx.crypto && <span className="shrink-0 tabular-nums">{tx.crypto}</span>}
        </span>
      </span>
    </>
  );
}
