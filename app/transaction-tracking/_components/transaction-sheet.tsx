"use client";

import { AnimatePresence, MotionConfig, motion, type Variants } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { Hex } from "viem";
import { Money } from "@/app/(tabs)/_components/money";
import { LightningIcon, type Icon } from "@/components/icons";
import { useBack } from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Drawer, FloatingSheetContent, FloatingSheetHeader } from "@/components/ui/drawer";
import { withdrawal, type Tracked } from "../data";
import { CopyButton } from "./copy-button";
import { LiveTracking, type Live } from "./live-tracking";
import { leave, settle, sharp, swap } from "./motion";
import { StatusCard } from "./status-card";
import { UsdcCoin } from "./usdc-coin";

const more: Variants = {
  hidden: { opacity: 0, transition: leave },
  shown: { opacity: 1, transition: { delayChildren: 0.05, staggerChildren: 0.04 } },
};

const row: Variants = {
  hidden: { opacity: 0, filter: "blur(4px)", y: 6 },
  shown: { opacity: 1, filter: "blur(0px)", y: 0 },
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <motion.div variants={row} className="flex flex-wrap items-center justify-between gap-x-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="ml-auto font-medium">{children}</dd>
    </motion.div>
  );
}

/**
 * The tracker over whatever screen opened it: a live send when given one, else the mock withdrawal.
 * Its state lives in the content, so every open replays the settlement.
 */
export function TransactionSheet({
  open,
  onOpenChange,
  onClosed,
  live,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After the close animation. */
  onClosed?: () => void;
  live?: Live;
}) {
  return (
    <MotionConfig reducedMotion="user" transition={settle}>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        onAnimationEnd={(isOpen) => {
          if (!isOpen) onClosed?.();
        }}
      >
        <FloatingSheetContent className="bg-transparent">
          {live ? <LiveTracking {...live} /> : <MockTracking />}
        </FloatingSheetContent>
      </Drawer>
    </MotionConfig>
  );
}

/**
 * A direct visit to /transaction-tracking: the sheet is up on arrival and closing it leaves the screen.
 * With `hash`, `amount` and `to` it tracks that send, scheduled to leave at `leaves` if Swissquote holds it;
 * without, the mock USDC withdrawal.
 * A live send has nothing to go back to (its review is spent), so it closes to Home.
 */
export function TransactionRoute() {
  const params = useSearchParams();
  const [hash, amount, to, leaves] = [params.get("hash"), params.get("amount"), params.get("to"), params.get("leaves")];
  const live = hash !== null && amount !== null && to !== null ? { hash: hash as Hex, amount, to, leaves: leaves === null ? undefined : Number(leaves) } : undefined;
  const router = useRouter();
  const back = useBack("/history");
  const [open, setOpen] = useState(true);
  const close = live ? () => router.replace("/home", { transitionTypes: ["pop"] }) : back;
  return <TransactionSheet open={open} onOpenChange={setOpen} onClosed={close} live={live} />;
}

function MockTracking() {
  const [step, setStep] = useState(withdrawal.step);

  useEffect(() => {
    // Mock settlement: the payout lands.
    const land = setTimeout(() => setStep(withdrawal.steps.length - 1), 1400);
    return () => clearTimeout(land);
  }, []);

  return <Tracking tx={withdrawal} step={step} />;
}

/** `step` indexes `tx.steps`. Once it reaches the last one, the tracker folds into a single status row. */
export function Tracking({ tx, step, badge }: { tx: Tracked; step: number; badge?: Icon }) {
  const [expanded, setExpanded] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const last = step === tx.steps.length - 1;

  useEffect(() => {
    if (!last) return;
    const fold = setTimeout(() => setExpanded(false), 400);
    return () => clearTimeout(fold);
  }, [last]);

  const summary = [
    `${tx.title}: ${tx.amount}`,
    tx.date,
    `Status: ${tx.steps[step].label}`,
    ...tx.rows.map((r) => `${r.label}: ${r.value}`),
  ].join("\n");

  return (
    <>
      {/* The surface carries the height spring, so the drawer box stays transparent; content only translates, so text never stretches. */}
      <motion.div layout aria-hidden className="absolute inset-0 -z-10 bg-background" style={{ borderRadius: 36 }} />
      {/* Layout-animated so its clip box follows the surface instead of cutting the header off mid-fold. */}
      <motion.div layout layoutScroll className="min-h-0 overflow-y-auto px-4 pb-4">
        <motion.div layout="position">
          <FloatingSheetHeader icon={<UsdcCoin Badge={badge} />} title={tx.title}>
            {/* The same header as History's other detail sheets: signed dollars, then the token amount. */}
            <p className="mt-1 text-amount">
              −<Money value={tx.usd} />
            </p>
            <p className="mt-1 text-body text-muted-foreground tabular-nums">{tx.amount}</p>
            <p className="text-body text-muted-foreground">{tx.date}</p>
          </FloatingSheetHeader>
        </motion.div>

        <StatusCard steps={tx.steps} tracker={{ step, expanded }} summary={summary} onToggle={() => setExpanded((e) => !e)} />

        <motion.dl layout="position" className="px-4">
          {tx.rows.map((r) => (
            <Row key={r.label} label={r.label}>
              {r.value}
            </Row>
          ))}
        </motion.dl>

        <AnimatePresence initial={false} mode="popLayout" anchorY="bottom">
          {detailsOpen && (
            <motion.div
              key="more"
              id="more-details"
              layout="position"
              variants={more}
              initial="hidden"
              animate="shown"
              exit="hidden"
              className="px-4"
            >
              <dl>
                <Row label={tx.rail.label}>{tx.rail.value}</Row>
                {tx.txHash && (
                  <Row label="Transaction id">
                    <CopyButton text={tx.txHash} label="Copy transaction id">
                      {tx.txHash.slice(0, 6)}...{tx.txHash.slice(-4)}
                    </CopyButton>
                  </Row>
                )}
                <Row label="Network fee">
                  <span className="flex items-center gap-1 text-positive">
                    <LightningIcon size={16} />
                    {tx.networkFee}
                    <span className="font-normal text-muted-foreground">· {tx.feePaidBy}</span>
                  </span>
                </Row>
              </dl>
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          variant="secondary"
          render={<motion.button layout="position" />}
          onClick={() => setDetailsOpen((open) => !open)}
          aria-expanded={detailsOpen}
          aria-controls="more-details"
          className="mt-4 w-full gap-1"
        >
          <span className="grid justify-items-end">
            {(["Show", "Hide"] as const).map((word) => {
              const visible = (word === "Hide") === detailsOpen;
              return (
                <motion.span
                  key={word}
                  aria-hidden={!visible}
                  className="col-start-1 row-start-1"
                  initial={false}
                  animate={visible ? sharp : { opacity: 0, filter: "blur(3px)", y: word === "Show" ? -8 : 8 }}
                  transition={swap}
                >
                  {word}
                </motion.span>
              );
            })}
          </span>
          details
        </Button>
      </motion.div>
    </>
  );
}
