"use client";

import { ArrowDownIcon, CheckIcon, CopyIcon, ShareNetworkIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { wallet } from "@/app/coin-breakdown/data";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

const N = 29;
const iconSwap = { type: "spring", duration: 0.3, bounce: 0 } as const;
const iconFrom = { opacity: 0, scale: 0.25, filter: "blur(4px)" };
const iconTo = { opacity: 1, scale: 1, filter: "blur(0px)" };

const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
const inLogo = (x: number, y: number) => Math.abs(x - (N - 1) / 2) < 4.5 && Math.abs(y - (N - 1) / 2) < 4.5;

// ponytail: decorative, NOT scannable. A real QR encoder (Reed-Solomon, masking) is the upgrade path.
function qrPath(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) + 0x6d2b79f5), ((h ^ (h >>> 13)) >>> 0) / 2 ** 32);
  let d = "";
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) if (!inFinder(x, y) && !inLogo(x, y) && rand() < 0.5) d += `M${x} ${y}h1v1h-1z`;
  return d;
}

function Finder({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path fillRule="evenodd" d="M0 0h7v7H0zM1 1v5h5V1z" />
      <rect x="2" y="2" width="3" height="3" />
    </g>
  );
}

function Qr() {
  const d = useMemo(() => qrPath(wallet.address), []);
  return (
    <div className="relative size-[200px]">
      <svg viewBox={`0 0 ${N} ${N}`} className="size-full" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
        <path d={d} />
        <Finder x={0} y={0} />
        <Finder x={N - 7} y={0} />
        <Finder x={0} y={N - 7} />
      </svg>
      <span className="absolute top-1/2 left-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06)]">
        <ArrowDownIcon weight="bold" size={26} className="text-[#ef642c]" />
      </span>
    </div>
  );
}

function IconSwap({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <span className="relative grid size-5 place-items-center">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={k} className="flex" initial={iconFrom} animate={iconTo} exit={iconFrom} transition={iconSwap}>
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function ReceiveSheet({ open, onOpenChange, onClosed }: { open: boolean; onOpenChange: (o: boolean) => void; onClosed: () => void }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
    } catch {
      // Clipboard unavailable: no false confirmation.
    }
  }

  const pill = "h-12 flex-1 gap-2 px-5";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        aria-describedby={undefined}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed();
        }}
        className="pb-[max(20px,env(safe-area-inset-bottom))] tracking-[-0.02em] sm:pb-5"
      >
        <header className="relative flex h-11 shrink-0 items-center justify-center">
          <DrawerTitle>Receive</DrawerTitle>
          <DrawerClose asChild>
            <BackButton kind="close" className="absolute right-4" />
          </DrawerClose>
        </header>

        <div className="flex flex-col items-center overflow-y-auto px-5 pt-3">
          <div className="rounded-[28px] border border-black/[0.06] bg-surface p-4">
            <div className="rounded-2xl bg-white p-3">
              <Qr />
            </div>
          </div>

          <p className="mt-5 max-w-[280px] text-center font-mono text-[15px] leading-6 tracking-normal break-all text-black tabular-nums">
            {wallet.address}
          </p>

          <div className="mt-5 flex w-full gap-3">
            <Button variant="default" onClick={copy} className={pill}>
              <IconSwap k={copied ? "check" : "copy"}>
                {copied ? <CheckIcon size={18} weight="bold" /> : <CopyIcon size={18} weight="bold" />}
              </IconSwap>
              {copied ? "Copied" : "Copy address"}
              <span className="sr-only" aria-live="polite">
                {copied ? "Address copied" : ""}
              </span>
            </Button>
            {canShare && (
              <Button
                variant="secondary"
                className={pill}
                onClick={() => navigator.share({ title: "My Fuse address", text: wallet.address }).catch(() => {})}
              >
                <ShareNetworkIcon size={18} weight="bold" />
                Share
              </Button>
            )}
          </div>

          <p className="mt-4 text-center text-[13px] leading-5 text-black/35">Only send Solana (SPL) tokens to this address.</p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
