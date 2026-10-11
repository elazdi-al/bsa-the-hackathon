"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Drawer as Vaul } from "vaul";
import { ScanIcon, WarningIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DrawerContent, DrawerHeader } from "@/components/ui/drawer";
import { phone } from "@/lib/wallet/phone";
import { cn } from "@/lib/utils";
import { scannedRecipient, type Scanned } from "../scan";
import { blurSwap, iconPop } from "./motion";

type Detector = import("qr/decode.js").BarcodeDetector;
type Status = "aiming" | "noWallet" | "denied" | "noCamera" | "unavailable";

const SCAN_EVERY_MS = 150;

const SAYS: Record<Status, string> = {
  aiming: "Point the camera at the QR code of the wallet you're paying.",
  noWallet: "This code holds no wallet address.",
  denied: "The camera is off for this app. Allow it in Settings, or paste the address.",
  noCamera: "This device has no camera. Paste the address instead.",
  unavailable: "The camera can't open here. Paste the address instead.",
};

/** The browser's own QR reader where it has one (Chrome); the `qr` package's where it doesn't (iOS, Safari). */
async function qrDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: typeof import("qr/decode.js").BarcodeDetector }).BarcodeDetector;
  if (Native && (await Native.getSupportedFormats()).includes("qr_code")) return new Native({ formats: ["qr_code"] });
  return new (await import("qr/decode.js")).BarcodeDetector({ formats: ["qr_code"] });
}

function cameraProblem(error: unknown): Status {
  const name = (error as Error).name;
  return name === "NotAllowedError" ? "denied" : name === "NotFoundError" ? "noCamera" : "unavailable";
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A code with a wallet address in it was read; the camera is already off. */
  onScan: (scanned: Scanned) => void;
  onPaste: () => void;
};

/** The camera, in a sheet over the recipient chooser. */
export function ScanSheet({ open, onOpenChange, onScan, onPaste }: Props) {
  return (
    <Vaul.NestedRoot open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined} className="pb-[max(24px,env(safe-area-inset-bottom))] sm:pb-6">
        <DrawerHeader title="Scan QR code" />
        <Viewfinder onScan={onScan} onPaste={onPaste} />
      </DrawerContent>
    </Vaul.NestedRoot>
  );
}

// Mounted only while the sheet is open, so the camera runs only then.
function Viewfinder({ onScan, onPaste }: Pick<Props, "onScan" | "onPaste">) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("aiming");
  const [live, setLive] = useState(false);
  const found = useEffectEvent(onScan);
  const failed = status !== "aiming" && status !== "noWallet";

  useEffect(() => {
    let stream: MediaStream | undefined;
    let stopped = false;
    const stop = () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch (error) {
        return setStatus(cameraProblem(error));
      }
      if (stopped) return stop();
      video.current!.srcObject = stream;
      // Without Swissquote's answer a USDC link still gives its address, just not its amount.
      const [detector, usdc] = await Promise.all([qrDetector(), phone.config().then((c) => c.usdc, () => undefined)]);
      while (!stopped) {
        // A frame not ready yet throws; that's just no code in it.
        const [code] = await detector.detect(video.current!).catch(() => []);
        const scanned = code && scannedRecipient(code.rawValue, usdc);
        if (scanned) {
          stop();
          return found(scanned);
        }
        if (code) setStatus("noWallet");
        await new Promise((resolve) => setTimeout(resolve, SCAN_EVERY_MS));
      }
    })();
    return stop;
  }, []);

  return (
    <div className="flex flex-col px-6 pt-4">
      <div className="relative aspect-square overflow-hidden rounded-[28px] bg-secondary">
        <video
          ref={video}
          aria-hidden
          autoPlay
          muted
          playsInline
          onPlaying={() => setLive(true)}
          className={cn("size-full bg-black object-cover transition-opacity duration-200 ease-out", !live && "opacity-0")}
        />
        <div aria-hidden className="absolute inset-0 grid place-items-center">
          {failed ? (
            <ScanIcon size={48} className="text-faint" />
          ) : (
            // The frame to aim at, the picture around it dimmed.
            <span
              className={cn(
                "size-[70%] rounded-[24px] shadow-[0_0_0_100vmax_rgb(0_0_0/0.3)] ring-2 ring-white/80 transition-opacity duration-200 ease-out",
                !live && "opacity-0",
              )}
            />
          )}
        </div>
      </div>

      <p aria-live="polite" className="relative mt-4 h-[2lh] text-center text-body text-balance text-muted-foreground">
        <AnimatePresence initial={false}>
          <motion.span key={status} variants={blurSwap} initial="hidden" animate="shown" exit="hidden" className="absolute inset-x-0 top-0">
            {status !== "aiming" && (
              <motion.span variants={iconPop} className="mr-1.5 inline-grid size-4 place-items-center align-[-3px]">
                <WarningIcon size={16} className="text-negative" />
              </motion.span>
            )}
            {SAYS[status]}
          </motion.span>
        </AnimatePresence>
      </p>

      {failed && (
        <Button variant="secondary" onClick={onPaste} className="mt-2 w-full">
          Paste address instead
        </Button>
      )}
    </div>
  );
}
