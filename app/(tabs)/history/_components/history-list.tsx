"use client";

import { LightningIcon, ReceiptIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CopyButton } from "@/app/transaction-tracking/_components/copy-button";
import { TransactionSheet } from "@/app/transaction-tracking/_components/transaction-sheet";
import { Drawer, FloatingSheetContent, FloatingSheetHeader } from "@/components/ui/drawer";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { hairline, rowPress, sectionLabel } from "../../_components/list";
import { Money } from "../../_components/money";
import { blurred, leave, reveal, sharp, snappy } from "../../_components/transitions";
import { tiles, type TileId } from "../../home/data";
import { byDay, filters, fullDate, monthSummary, transactions, type Filter, type Tx } from "../data";
import { Amount, Glyph, RowBody } from "./tx-row";

const rowClass = `flex min-h-[60px] w-full items-center gap-3 rounded-[18px] px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-black/20 ${rowPress}`;

const faded = { opacity: 0, filter: "blur(4px)" };

const arrive = {
  initial: { opacity: 0, filter: blurred, scale: 0.96 },
  animate: { opacity: 1, filter: sharp, scale: 1 },
  transition: { ...reveal, delay: 0.15 },
};

// The session's first History visit staggers its rows in; revisits just show them.
let introPlayed = false;

export function HistoryList({ account, sent }: { account?: TileId; sent: Tx | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);
  // Kept after close so the sheet's content doesn't vanish mid-exit.
  const [tx, setTx] = useState<Tx | null>(null);
  const tracked = tx?.kind === "withdrawal";

  const scoped = (sent ? [sent, ...transactions] : transactions).filter((t) => !account || t.account === account);
  const shown = scoped.filter(filters[filter].match);
  const groups = byDay(shown);
  const summary = monthSummary(scoped);
  const scope = tiles.find((t) => t.id === account);

  const [intro] = useState(() => !introPlayed);
  // motion reads `initial` only on mount, so entrances belong to the first render: whatever a filter change mounts later
  // cross-fades as a whole instead of replaying the stagger or the sent row's arrival.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    introPlayed = true;
    setMounted(true);
  }, []);

  // The params go once read: a refresh or Back must not show the send again.
  useEffect(() => {
    if (sent) history.replaceState(null, "", "/history");
  }, [sent]);

  return (
    <div className="max-w-2xl">
      <p className="mt-1 text-[13px] leading-[18px] text-[#adadad]">
        {summary.month}
        {summary.in > 0 && (
          <>
            {" "}
            · In <span className="text-positive">+<Money value={summary.in} /></span>
          </>
        )}
        {summary.out > 0 && (
          <>
            {" "}
            · Out −<Money value={summary.out} />
          </>
        )}
      </p>

      <div className="mt-4 flex items-center">
        <ToggleGroup
          aria-label="Filter transactions"
          value={[filter]}
          onValueChange={([next]) => next && setFilter(next as Filter)}
          className="-ml-[3px] gap-0"
        >
          {(Object.keys(filters) as Filter[]).map((f) => (
            <ToggleGroupItem
              key={f}
              value={f}
              className="relative h-11 rounded-full px-3.5 text-[13px] font-semibold text-[#bcbcbc] transition-[color,scale] duration-150 hover:bg-transparent hover:text-[#bcbcbc] focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-inset active:scale-[0.96] aria-pressed:bg-transparent aria-pressed:text-black"
            >
              {f === filter && (
                <motion.span
                  layoutId="history-filter"
                  transition={snappy}
                  className="absolute inset-x-[3px] inset-y-[11px] rounded-full bg-[#f2f2f2]"
                />
              )}
              <span className="relative z-10">{filters[f].label}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {scope && (
          <Link
            href="/history"
            replace
            scroll={false}
            className="relative ml-auto flex h-7 items-center gap-1 rounded-full bg-[#f2f2f2] pr-2 pl-2.5 text-[13px] font-semibold outline-none transition-transform duration-150 ease-out after:absolute after:-inset-y-2 after:inset-x-0 focus-visible:ring-2 focus-visible:ring-black/20 active:scale-[0.96]"
          >
            {scope.label}
            <XIcon weight="bold" size={11} aria-hidden className="text-[#a5a5a5]" />
            <span className="sr-only">, show all accounts</span>
          </Link>
        )}
      </div>

      <div className="relative mt-3">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={`${account ?? "all"}-${groups.length ? filter : "empty"}`}
            initial={mounted ? faded : false}
            animate={{ opacity: 1, filter: sharp, transition: { ...reveal, duration: 0.3 } }}
            exit={{ ...faded, transition: leave }}
          >
            {groups.length ? (
              // Rows bleed their press highlight past the column, so the glyphs line up with the title.
              <div className="-mx-3">
                {groups.map((g) => (
                  <section key={g.date} aria-label={g.label} className="mb-5">
                    <h2 className={`px-3 ${sectionLabel}`}>{g.label}</h2>
                    <ul>
                      {g.items.map((t) => {
                        const i = shown.indexOf(t);
                        const motionProps =
                          t === sent
                            ? { ...arrive, initial: mounted ? false : arrive.initial }
                            : {
                                initial: intro && !mounted && i < 8 ? { ...faded, y: 6 } : false,
                                animate: { opacity: 1, filter: sharp, y: 0 },
                                transition: { ...reveal, delay: 0.05 + i * 0.03 },
                              };
                        return (
                          <motion.li key={t.id} {...motionProps}>
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
                          </motion.li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <Empty noun={filters[filter].noun} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <Drawer open={open && !tracked} onOpenChange={setOpen}>
        <FloatingSheetContent>
          <div className="min-h-0 overflow-y-auto px-4 pb-4">{tx && <Sheet tx={tx} />}</div>
        </FloatingSheetContent>
      </Drawer>
      <TransactionSheet open={open && tracked} onOpenChange={setOpen} />
    </div>
  );
}

function Empty({ noun }: { noun: string }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <motion.span
        aria-hidden
        className="grid size-[54px] place-items-center rounded-full bg-[#f2f2f2] text-[#bcbcbc]"
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <ReceiptIcon weight="fill" size={26} />
      </motion.span>
      <p className="mt-4 text-[15px] leading-5 font-medium text-[#adadad]">
        No{" "}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={noun}
            className="inline-block"
            initial={faded}
            animate={{ opacity: 1, filter: sharp }}
            exit={faded}
            transition={snappy}
          >
            {noun}
          </motion.span>
        </AnimatePresence>{" "}
        yet
      </p>
    </div>
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

      <dl className={`mt-6 rounded-[18px] px-4 py-2 ${hairline}`}>
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
