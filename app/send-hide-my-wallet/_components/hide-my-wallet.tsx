"use client";

import { WarningCircleIcon } from "@phosphor-icons/react";
import { MotionConfig } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { GlassSwitch } from "./glass-switch";
import { HowItWorksSheet } from "./how-it-works-sheet";
import { ShieldLeftHalf } from "./icons";
import { SendButton, type Phase } from "./send-button";

const SENDING_MS = 1400;
const SENT_MS = 900;

export function HideMyWallet() {
  const router = useRouter();
  const titleId = useId();
  const [hidden, setHidden] = useState(false);
  const [phase, setPhase] = useState<Phase>("review");
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (phase === "review") return;
    const id = setTimeout(
      () => (phase === "sending" ? setPhase("sent") : router.push("/home")),
      phase === "sending" ? SENDING_MS : SENT_MS,
    );
    return () => clearTimeout(id);
  }, [phase, router]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex items-center gap-[15px] pr-1.5 pl-3">
        <ShieldLeftHalf className="h-6 w-5 shrink-0 text-fuse-blue" />
        <div className="min-w-0 flex-1 text-[14px] leading-[17px] tracking-[-0.15px]">
          <p id={titleId}>
            <span className="font-medium">Send with</span> Hide My Wallet
          </p>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setSheetOpen(true)}
            className="relative flex items-center gap-1 rounded-sm text-black/35 outline-offset-2 outline-fuse-blue transition-opacity after:absolute after:-inset-x-2 after:-inset-y-3 focus-visible:outline-2 active:opacity-60"
          >
            How it works?
            <WarningCircleIcon aria-hidden weight="duotone" className="size-4" />
          </button>
        </div>
        <GlassSwitch
          checked={hidden}
          onCheckedChange={setHidden}
          disabled={phase !== "review"}
          labelledBy={titleId}
        />
      </div>
      <div className="mt-[26px]">
        <SendButton hidden={hidden} phase={phase} onSend={() => setPhase("sending")} />
      </div>
      <HowItWorksSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </MotionConfig>
  );
}
