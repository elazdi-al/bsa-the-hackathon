"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CopyButton } from "@/app/transaction-tracking/_components/copy-button";
import { TransactionSheet } from "@/app/transaction-tracking/_components/transaction-sheet";
import { CloseIcon, LightningIcon, ReceiptIcon } from "@/components/icons";
import { Drawer, FloatingSheetContent, FloatingSheetHeader } from "@/components/ui/drawer";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { rowPress } from "../../_components/list";
import { Money } from "../../_components/money";
import { blurred, leave, reveal, sharp, snappy } from "../../_components/transitions";
import { tiles, type TileId } from "../../home/data";
import { byDay, filters, fullDate, monthSummary, transactions, type Filter, type Tx } from "../data";
import { useLiveTxs } from "../live";
import { Amount, Glyph, RowBody } from "./tx-row";

const rowClass = `flex min-h-[68px] w-full items-center gap-4 rounded-2xl px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${rowPress}`;

const faded = { opacity: 0, filter: "blur(4px)" };

const arrive = {
  initial: { opacity: 0, filter: blurred, scale: 0.96 },
  animate: { opacity: 1, filter: sharp, scale: 1 },
  transition: { ...reveal, delay: 0.15 },
};

// The session's first History visit staggers its rows in; revisits just show them.
let introPlayed = false;

export function HistoryList({ account }: { account?: TileId }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);
  // Kept after close so the sheet's content doesn't vanish mid-exit.
  const [tx, setTx] = useState<Tx | null>(null);
  const tracked = tx?.kind === "withdrawal";

  const live = useLiveTxs();
  const scoped = [...live.txs, ...transactions].filter((t) => !account || t.account === account);
  const shown = scoped.filter(filters[filter].match);
  const groups = byDay(shown);
  const summary = monthSummary(scoped);
  const scope = tiles.find((t) => t.id === account);

  const [intro] = useState(() => !introPlayed);
  // motion reads `initial` only on mount, so entrances belong to the first render: whatever a filter change mounts later
  // cross-fades as a whole instead of replaying the stagger or a live row's arrival.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    introPlayed = true;
    setMounted(true);
  }, []);

  return (
    <div className="max-w-2xl">
      <p className="mt-1 text-body text-muted-foreground">
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

      <div className="mt-4 flex flex-wrap items-center gap-x-2">
        <ToggleGroup
          aria-label="Filter transactions"
          value={[filter]}
          onValueChange={([next]) => next && setFilter(next as Filter)}
          className="gap-0"
        >
          {(Object.keys(filters) as Filter[]).map((f) => (
            <ToggleGroupItem
              key={f}
              value={f}
              className="relative h-11 rounded-full px-3.5 text-muted-foreground hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-pressed:bg-transparent aria-pressed:text-foreground"
            >
              {f === filter && (
                <motion.span
                  layoutId="history-filter"
                  transition={snappy}
                  className="absolute inset-x-0 inset-y-1.5 rounded-full bg-secondary"
                />
              )}
              <span className="relative z-10 text-caption font-semibold">{filters[f].label}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {scope && (
          <Link
            href="/history"
            replace
            scroll={false}
            className="relative my-1.5 flex h-8 items-center gap-1 rounded-full bg-secondary pr-2.5 pl-3.5 text-caption font-semibold outline-none transition-transform duration-150 ease-out after:absolute after:-inset-y-1.5 after:inset-x-0 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
          >
            {scope.label}
            <CloseIcon size={16} aria-hidden className="text-muted-foreground" />
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
                  <section key={g.date} aria-label={g.label} className="mt-6 first:mt-0">
                    <h2 className="mb-1 px-3 text-label">{g.label}</h2>
                    <ul>
                      {g.items.map((t) => {
                        const i = shown.indexOf(t);
                        const motionProps = live.arrived(t)
                          ? arrive
                          : {
                              initial: intro && !mounted && i < 8 ? { ...faded, y: 6 } : false,
                              // The same keys as `arrive`: a key dropped from `animate` mid-arrival freezes where it is.
                              animate: { opacity: 1, filter: sharp, y: 0, scale: 1 },
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
                              <RowBody tx={t} />
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
          <div className="min-h-0 overflow-y-auto px-4 pb-6">{tx && <Sheet tx={tx} />}</div>
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
        className="text-muted-foreground"
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <ReceiptIcon size={48} />
      </motion.span>
      <p className="mt-4 text-body text-muted-foreground">
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
    <div className="flex min-h-11 items-center justify-between gap-4">
      <dt className="shrink-0 text-body text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-body font-semibold">{children}</dd>
    </div>
  );
}

function Sheet({ tx }: { tx: Tx }) {
  return (
    <>
      <FloatingSheetHeader icon={<Glyph kind={tx.kind} size="hero" />} title={tx.title}>
        <p className={`mt-1 text-amount ${tx.flow === "in" ? "text-positive" : ""}`}>
          <Amount tx={tx} />
        </p>
        {tx.crypto && <p className="mt-1 text-body text-muted-foreground tabular-nums">{tx.crypto}</p>}
        <p className="text-body text-muted-foreground">{fullDate(tx)}</p>
      </FloatingSheetHeader>

      <dl className="mt-8 px-4">
        {tx.rows.map((r) => (
          <Detail key={r.label} label={r.label}>
            {r.value}
          </Detail>
        ))}
        {tx.fee && (
          <Detail label="Network fee">
            <span className="inline-flex items-center gap-1">
              <LightningIcon size={16} className="text-positive" />
              Free<span className="font-normal text-muted-foreground"> · paid by Swissquote</span>
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
