"use client";

import {
  ArrowDownIcon,
  ArrowsClockwiseIcon,
  BankIcon,
  CreditCardIcon,
  LightningIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  SparkleIcon,
  type Icon,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { CopyButton } from "@/app/transaction-tracking/_components/copy-button";
import { TransactionSheet } from "@/app/transaction-tracking/_components/transaction-sheet";
import { Drawer, FloatingSheetContent, FloatingSheetHeader } from "@/components/ui/drawer";
import { Money } from "../../_components/money";
import { blurred, reveal, sharp } from "../../_components/transitions";
import { dayLabel, fullDate, groups, now, summary, type Kind, type Tx } from "../data";

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

function Glyph({ kind, size }: { kind: Kind; size: number }) {
  const { Icon: I, glyph, tint } = kinds[kind];
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full ${tint} ${glyph}`} style={{ width: size, height: size }}>
      <I weight={kind === "receive" ? "bold" : "fill"} size={size * 0.5} />
    </span>
  );
}

const sign = { in: "+", out: "−", swap: "" } as const;

function Amount({ tx }: { tx: Tx }) {
  return (
    <>
      {sign[tx.flow]}
      <Money value={tx.usd} />
    </>
  );
}

const rowClass =
  "flex min-h-[60px] w-full items-center gap-3 rounded-[18px] px-3 py-2 text-left outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-fuse-blue active:bg-black/[0.04] [@media(hover:hover)]:hover:bg-black/[0.025]";

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

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[7px]">
      <dt className="shrink-0 text-[#909090]">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{children}</dd>
    </div>
  );
}

function Sheet({ tx }: { tx: Tx }) {
  return (
    <>
      <FloatingSheetHeader icon={<Glyph kind={tx.kind} size={54} />} title={tx.title}>
        <p className={`mt-1 text-[27.5px] leading-[34px] font-bold tracking-[-0.01em] ${tx.flow === "in" ? "text-positive" : ""}`}>
          <Amount tx={tx} />
        </p>
        {tx.crypto && <p className="text-[13.5px] text-[#969696] tabular-nums">{tx.crypto}</p>}
        <p className="mt-1 font-medium text-[#969696]">{fullDate(tx)}</p>
      </FloatingSheetHeader>

      <dl className="mt-6 rounded-[18px] px-4 py-2 shadow-[0_0_0_1px_rgb(0_0_0/0.035),0_2px_6px_rgb(0_0_0/0.02)]">
        {tx.rows.map((r) => (
          <Detail key={r.label} label={r.label}>
            {r.value}
          </Detail>
        ))}
        {tx.fee && (
          <Detail label="Network fee">
            <span className="inline-flex items-center gap-1.5 text-positive">
              <LightningIcon size={15} weight="fill" />
              Free <span className="font-normal text-[#a5a5a5]">· covered by Fuse⁺</span>
            </span>
          </Detail>
        )}
        {tx.hash && (
          <Detail label="Transaction id">
            <CopyButton text={tx.hash} label="Copy transaction id">
              {tx.hash.slice(0, 4)}...{tx.hash.slice(-4)}
            </CopyButton>
          </Detail>
        )}
        <Detail label="Status">
          <span className={tx.status === "Completed" ? "text-positive" : "text-pending"}>{tx.status}</span>
        </Detail>
      </dl>
    </>
  );
}

const arrive = {
  initial: { opacity: 0, filter: blurred, scale: 0.96 },
  animate: { opacity: 1, filter: sharp, scale: 1 },
  transition: { ...reveal, delay: 0.15 },
};

/** The send that just completed, from `?sent=<recipient>&amount=<usd>` (see the send review). */
function justSent(search: string): Tx | null {
  const params = new URLSearchParams(search);
  const to = params.get("sent")?.trim();
  const usd = Math.round(Number(params.get("amount")) * 100) / 100;
  if (!to || !Number.isFinite(usd) || usd <= 0) return null;
  return {
    id: "just-sent",
    account: "cash",
    kind: "send",
    title: `Sent to ${to}`,
    detail: "Wallet",
    date: now.date,
    time: now.time,
    usd,
    flow: "out",
    crypto: `${usd.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDC`,
    status: "Pending",
    rows: [{ label: "To", value: to }],
    fee: true,
  };
}

export function HistoryList() {
  const [open, setOpen] = useState(false);
  // Kept after close so the sheet's content doesn't vanish mid-exit.
  const [tx, setTx] = useState<Tx | null>(null);
  const [sent, setSent] = useState<Tx | null>(null);
  // A withdrawal opens its live tracker; everything else, the detail sheet.
  const tracked = tx?.kind === "withdrawal";

  // Before paint, so the list never jumps. The params go once read: a refresh or Back must not send it twice.
  useLayoutEffect(() => {
    const next = justSent(location.search);
    if (!next) return;
    setSent(next);
    history.replaceState(null, "", "/history");
  }, []);

  return (
    <>
      <p className="mt-1 text-[13px] leading-[18px] text-[#adadad]">
        {summary.month} · In <span className="text-positive">+<Money value={summary.in} /></span> · Out −<Money value={summary.out} />
      </p>

      <div className="mt-6 max-w-2xl">
        {groups.map((g) => (
          <section key={g.label} className="mb-5" aria-label={g.label}>
            <h2 className="px-3 pb-1 text-[13px] leading-[18px] font-medium text-[#adadad]">{g.label}</h2>
            <ul>
              {(sent && dayLabel(sent.date) === g.label ? [sent, ...g.items] : g.items).map((t) => {
                const row = (
                  <button
                    type="button"
                    className={rowClass}
                    onClick={() => {
                      setTx(t);
                      setOpen(true);
                    }}
                  >
                    <RowBody tx={t} when={t === sent ? "Just now" : undefined} />
                  </button>
                );
                return t === sent ? (
                  <motion.li key={t.id} {...arrive}>
                    {row}
                  </motion.li>
                ) : (
                  <li key={t.id}>{row}</li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <Drawer open={open && !tracked} onOpenChange={setOpen}>
        <FloatingSheetContent>
          <div className="min-h-0 overflow-y-auto px-4 pb-4">{tx && <Sheet tx={tx} />}</div>
        </FloatingSheetContent>
      </Drawer>
      <TransactionSheet open={open && tracked} onOpenChange={setOpen} />
    </>
  );
}
