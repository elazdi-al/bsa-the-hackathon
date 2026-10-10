"use client";

import { LightningIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, MotionConfig, motion, type Variants } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { steps, withdrawal } from "../data";
import { CopyButton } from "./copy-button";
import { leave, settle, sharp, swap } from "./motion";
import { StatusCard, type Tracker } from "./status-card";
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
    <motion.div variants={row} className="flex flex-wrap items-center justify-between gap-x-4 py-[7px]">
      <dt className="text-[#909090]">{label}</dt>
      <dd className="ml-auto font-medium">{children}</dd>
    </motion.div>
  );
}

export function TransactionSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [tracker, setTracker] = useState<Tracker>({ step: withdrawal.step, expanded: true });
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    // Mock settlement: the payout lands, then the tracker folds into a single status row.
    const land = setTimeout(() => setTracker((t) => ({ ...t, step: steps.length - 1 })), 1400);
    const fold = setTimeout(() => setTracker((t) => ({ ...t, expanded: false })), 1800);
    return () => {
      clearTimeout(land);
      clearTimeout(fold);
    };
  }, []);

  const summary = [
    `${withdrawal.title}: ${withdrawal.amount}`,
    withdrawal.date,
    `Status: ${steps[tracker.step].label}`,
    ...withdrawal.rows.map((r) => `${r.label}: ${r.value}`),
  ].join("\n");

  return (
    <MotionConfig reducedMotion="user" transition={settle}>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        onAnimationEnd={(isOpen) => {
          if (!isOpen) router.push("/home");
        }}
      >
        {/* The shared handle sits outside the layout animation and would jump when the tracker folds, so the header draws its own. */}
        <DrawerContent
          aria-describedby={undefined}
          handle={false}
          className="inset-x-5 bottom-(--gap) max-h-[calc(100dvh-env(safe-area-inset-top)-12px-var(--gap))] bg-transparent text-[13.5px] leading-5 [--gap:max(20px,calc(env(safe-area-inset-bottom)+6px))] [--initial-transform:calc(100%+var(--gap))] sm:[--gap:1rem]"
        >
          {/* The surface carries the height spring, so the drawer box stays transparent; content only translates, so text never stretches. */}
          <motion.div layout aria-hidden className="absolute inset-0 -z-10 bg-[#f2f2f2]" style={{ borderRadius: 34 }} />
          {/* Layout-animated so its clip box follows the surface instead of cutting the header off mid-fold. */}
          <motion.div layout layoutScroll className="min-h-0 overflow-y-auto px-4 pb-[13px]">
            <motion.header layout="position" className="relative flex flex-col items-center pt-[47px] text-center">
              <span aria-hidden className="absolute top-2.5 h-[5px] w-9 rounded-full bg-black/10" />
              <DrawerClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close"
                  className="absolute top-[13px] -right-[3px] text-[#afafaf]"
                >
                  <XIcon size={20} weight="bold" />
                </Button>
              </DrawerClose>
              <UsdcCoin />
              <DrawerTitle className="mt-3 text-[13.5px] font-medium tracking-normal text-[#a5a5a5]">
                {withdrawal.title}
              </DrawerTitle>
              <p className="mt-1 text-[27.5px] leading-[34px] font-bold tracking-[-0.01em] tabular-nums">
                {withdrawal.amount}
              </p>
              <p className="mt-1 font-medium text-[#969696]">{withdrawal.date}</p>
            </motion.header>

            <StatusCard
              tracker={tracker}
              summary={summary}
              onToggle={() => setTracker((t) => ({ ...t, expanded: !t.expanded }))}
            />

            <motion.dl layout="position" className="mt-2 px-4">
              {withdrawal.rows.map((r) => (
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
                  className="px-4 pt-3"
                >
                  <hr className="h-px border-0 bg-[repeating-linear-gradient(90deg,#d4d4d4_0_8px,transparent_8px_16px)]" />
                  <dl className="mt-2">
                    <Row label="Payment rail">{withdrawal.paymentRail}</Row>
                    <Row label="Onchain transaction">
                      <CopyButton text={withdrawal.txHash} label="Copy onchain transaction">
                        {withdrawal.txHash.slice(0, 4)}...{withdrawal.txHash.slice(-4)}
                      </CopyButton>
                    </Row>
                    <Row label="Network fee">
                      <span className="flex items-center gap-1.5 text-[#30d158]">
                        <LightningIcon size={15} weight="fill" />
                        {withdrawal.networkFee}
                      </span>
                    </Row>
                  </dl>
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              variant="ghost"
              render={<motion.button layout="position" />}
              onClick={() => setDetailsOpen((open) => !open)}
              aria-expanded={detailsOpen}
              aria-controls="more-details"
              className="h-11 w-full gap-1 text-[13.5px]"
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
        </DrawerContent>
      </Drawer>
    </MotionConfig>
  );
}
