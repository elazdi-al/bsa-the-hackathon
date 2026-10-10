"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { encode } from "uqr";
import { CheckIcon, CopyIcon, ReceiveIcon, ShareIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { shownAddress, useWallet } from "./wallet";

const iconSwap = { type: "spring", duration: 0.3, bounce: 0 } as const;
const iconFrom = { opacity: 0, scale: 0.25, filter: "blur(4px)" };
const iconTo = { opacity: 1, scale: 1, filter: "blur(0px)" };

// Error correction H restores up to 30% of the code, so it still scans with its centre cleared for the badge.
function qrPath(text: string) {
  const { data, size } = encode(text, { ecc: "H", border: 0 });
  const c = (size - 1) / 2;
  let d = "";
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) if (data[y][x] && !(Math.abs(x - c) < 4.5 && Math.abs(y - c) < 4.5)) d += `M${x} ${y}h1v1h-1z`;
  return { d, size };
}

function Qr({ address }: { address: string }) {
  const { d, size } = useMemo(() => qrPath(address), [address]);
  return (
    <div className="relative size-[200px]">
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
        <path d={d} />
      </svg>
      <span className="absolute top-1/2 left-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl bg-background">
        <ReceiveIcon size={28} className="text-orange" />
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
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        aria-describedby={undefined}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClosed();
        }}
        className="pb-[max(24px,env(safe-area-inset-bottom))] sm:pb-6"
      >
        <DrawerHeader title="Receive" />
        <ReceiveBody />
      </DrawerContent>
    </Drawer>
  );
}

// Mounted only while the sheet is open, so the wallet store isn't polled from every tab.
function ReceiveBody() {
  const snapshot = useWallet();
  const address = shownAddress(snapshot);
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
      await navigator.clipboard.writeText(address!);
      setCopied(true);
    } catch {
      // Clipboard unavailable: no false confirmation.
    }
  }

  // Until the address is read, the QR and the address hold their space, blank.
  const reveal = cn("transition-[opacity,visibility] duration-200 ease-out", !address && "invisible opacity-0");

  return (
    <div className="flex flex-col items-center overflow-y-auto px-6 pt-6">
      <div className={reveal}>
        <Qr address={address ?? ""} />
      </div>

      <p className={cn("mt-6 max-w-[280px] text-center font-mono text-body text-balance break-all", reveal)}>{address ?? "0x0000000000000000000000000000000000000000"}</p>
      <p className="mt-2 text-center text-body text-muted-foreground">Only send USDC on Base to this address.</p>

      <div className="mt-8 flex w-full gap-3 *:flex-1">
        <Button onClick={copy} disabled={!address}>
          <IconSwap k={copied ? "check" : "copy"}>{copied ? <CheckIcon size={20} /> : <CopyIcon size={20} />}</IconSwap>
          {copied ? "Copied" : "Copy address"}
          <span className="sr-only" aria-live="polite">
            {copied ? "Address copied" : ""}
          </span>
        </Button>
        {canShare && (
          <Button
            variant="secondary"
            disabled={!address}
            onClick={() => navigator.share({ title: "My Swissquote Wallet address", text: address }).catch(() => {})}
          >
            <ShareIcon size={20} />
            Share
          </Button>
        )}
      </div>
    </div>
  );
}
