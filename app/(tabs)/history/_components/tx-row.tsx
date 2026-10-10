import { BankIcon, CardIcon, PlusIcon, ReceiveIcon, SendIcon, SparkleIcon, SwapIcon, type Icon } from "@/components/icons";
import { Money } from "../../_components/money";
import type { Kind, Tx } from "../data";

/** The app's single kind-to-colour mapping: a coloured glyph on a circle tinted with the same colour. */
export const kinds = {
  receive: { Icon: ReceiveIcon, text: "text-positive", tint: "bg-positive/12" },
  deposit: { Icon: BankIcon, text: "text-positive", tint: "bg-positive/12" },
  reward: { Icon: SparkleIcon, text: "text-orange", tint: "bg-orange/12" },
  send: { Icon: SendIcon, text: "text-purple", tint: "bg-purple/12" },
  withdrawal: { Icon: BankIcon, text: "text-purple", tint: "bg-purple/12" },
  swap: { Icon: SwapIcon, text: "text-brand", tint: "bg-brand/12" },
  card: { Icon: CardIcon, text: "text-ink", tint: "bg-secondary" },
  membership: { Icon: PlusIcon, text: "text-ink", tint: "bg-secondary" },
} satisfies Record<Kind, { Icon: Icon; text: string; tint: string }>;

const glyphSizes = {
  row: { box: "size-11", icon: 24 },
  hero: { box: "size-14", icon: 32 },
} as const;

export function Glyph({ kind, size = "row" }: { kind: Kind; size?: keyof typeof glyphSizes }) {
  const { Icon: I, text, tint } = kinds[kind];
  const { box, icon } = glyphSizes[size];
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full ${box} ${tint} ${text}`}>
      <I size={icon} />
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
      <Glyph kind={tx.kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-label">{tx.title}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-body text-muted-foreground">
          <span className="truncate">
            {when} · {tx.detail}
          </span>
          {tx.status === "Pending" && (
            <span className="shrink-0 rounded-full bg-pending/12 px-1.5 text-caption font-semibold text-pending">Pending</span>
          )}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-label tabular-nums ${tx.flow === "in" ? "text-positive" : ""}`}>
          <Amount tx={tx} />
        </span>
        {tx.crypto && <span className="mt-0.5 block text-body text-muted-foreground tabular-nums">{tx.crypto}</span>}
      </span>
    </>
  );
}
