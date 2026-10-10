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
  XIcon,
  type Icon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CopyButton } from "@/app/transaction-tracking/_components/copy-button";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Money } from "../../_components/money";
import { fullDate, groups, summary, type Kind, type Tx } from "../data";

// One scheme: a coloured glyph on a circle tinted with the same colour.
const kinds: Record<Kind, { Icon: Icon; glyph: string; tint: string }> = {
  receive: { Icon: ArrowDownIcon, glyph: "text-[#ef642c]", tint: "bg-[#ef642c]/12" },
  send: { Icon: PaperPlaneTiltIcon, glyph: "text-[#8a52f5]", tint: "bg-[#8a52f5]/12" },
  withdrawal: { Icon: BankIcon, glyph: "text-[#8a52f5]", tint: "bg-[#8a52f5]/12" },
  swap: { Icon: ArrowsClockwiseIcon, glyph: "text-[#2059f2]", tint: "bg-[#2059f2]/12" },
  reward: { Icon: SparkleIcon, glyph: "text-[#30b256]", tint: "bg-[#30b256]/12" },
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
  "flex min-h-[60px] w-full items-center gap-3 rounded-[18px] px-3 py-2 text-left outline-none transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-[#1171ee] active:bg-black/[0.04] [@media(hover:hover)]:hover:bg-black/[0.025]";

function RowBody({ tx }: { tx: Tx }) {
  return (
    <>
      <Glyph kind={tx.kind} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-5 font-medium">{tx.title}</span>
        <span className="mt-0.5 block truncate text-[13px] leading-[18px] text-[#adadad]">
          {tx.time} · {tx.detail}
          {tx.status === "Pending" && (
            <span className="ml-1.5 rounded-full bg-[#ef642c]/12 px-1.5 py-px text-[11px] font-medium text-[#ef642c]">Pending</span>
          )}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-[15px] leading-5 font-medium ${tx.flow === "in" ? "text-[#30b256]" : ""}`}>
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
      <header className="relative flex flex-col items-center pt-[47px] text-center">
        <span aria-hidden className="absolute top-2.5 h-[5px] w-9 rounded-full bg-black/10" />
        <DrawerClose asChild>
          <Button variant="ghost" size="icon" aria-label="Close" className="absolute top-[13px] -right-[3px] text-[#afafaf]">
            <XIcon size={20} weight="bold" />
          </Button>
        </DrawerClose>
        <Glyph kind={tx.kind} size={54} />
        <DrawerTitle className="mt-3 text-[13.5px] font-medium tracking-normal text-[#a5a5a5]">{tx.title}</DrawerTitle>
        <p className={`mt-1 text-[27.5px] leading-[34px] font-bold tracking-[-0.01em] ${tx.flow === "in" ? "text-[#30b256]" : ""}`}>
          <Amount tx={tx} />
        </p>
        {tx.crypto && <p className="text-[13.5px] text-[#969696] tabular-nums">{tx.crypto}</p>}
        <p className="mt-1 font-medium text-[#969696]">{fullDate(tx)}</p>
      </header>

      <dl className="mt-6 rounded-[18px] px-4 py-2 shadow-[0_0_0_1px_rgb(0_0_0/0.035),0_2px_6px_rgb(0_0_0/0.02)]">
        {tx.rows.map((r) => (
          <Detail key={r.label} label={r.label}>
            {r.value}
          </Detail>
        ))}
        {tx.fee && (
          <Detail label="Network fee">
            <span className="inline-flex items-center gap-1.5 text-[#30b256]">
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
          <span className={tx.status === "Completed" ? "text-[#30b256]" : "text-[#ef642c]"}>{tx.status}</span>
        </Detail>
      </dl>
    </>
  );
}

export function HistoryList() {
  const [open, setOpen] = useState(false);
  // Kept after close so the sheet's content doesn't vanish mid-exit.
  const [tx, setTx] = useState<Tx | null>(null);

  return (
    <>
      <p className="mt-1 text-[13px] leading-[18px] text-[#adadad]">
        {summary.month} · In <span className="text-[#30b256]">+<Money value={summary.in} /></span> · Out −<Money value={summary.out} />
      </p>

      <div className="mt-6 max-w-2xl">
        {groups.map((g) => (
          <section key={g.label} className="mb-5" aria-label={g.label}>
            <h2 className="px-3 pb-1 text-[13px] leading-[18px] font-medium text-[#adadad]">{g.label}</h2>
            <ul>
              {g.items.map((t) => (
                <li key={t.id}>
                  {t.href ? (
                    <Link href={t.href} className={rowClass}>
                      <RowBody tx={t} />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={rowClass}
                      onClick={() => {
                        setTx(t);
                        setOpen(true);
                      }}
                    >
                      <RowBody tx={t} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent
          aria-describedby={undefined}
          handle={false}
          className="inset-x-5 bottom-(--gap) bg-[#f2f2f2] text-[13.5px] leading-5 [--gap:max(20px,calc(env(safe-area-inset-bottom)+6px))] [--initial-transform:calc(100%+var(--gap))] rounded-[34px] after:hidden sm:[--gap:1rem]"
        >
          <div className="min-h-0 overflow-y-auto px-4 pb-4">{tx && <Sheet tx={tx} />}</div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
