"use client";

import { MotionConfig } from "motion/react";
import { sendDraft } from "@/app/choose-recipient/data";
import { useEffect, useId, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { HowItWorksSheet } from "./how-it-works-sheet";
import { ShieldLeftHalf } from "./icons";
import { SendButton, type Phase } from "./send-button";

const SENDING_MS = 1400;

export function HideMyWallet({ to }: { to?: string }) {
  const titleId = useId();
  const [hidden, setHidden] = useState(false);
  const [phase, setPhase] = useState<Phase>("review");

  useEffect(() => {
    if (to) sendDraft.set(to);
  }, [to]);

  // The send rests on Sent: there is no History screen to land on yet.
  useEffect(() => {
    if (phase !== "sending") return;
    const id = setTimeout(() => {
      sendDraft.clear();
      setPhase("sent");
    }, SENDING_MS);
    return () => clearTimeout(id);
  }, [phase]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex items-center gap-[15px] pr-1.5 pl-3">
        <ShieldLeftHalf className="h-6 w-5 shrink-0 text-fuse-blue" />
        <div className="min-w-0 flex-1 text-[14px] leading-[17px] tracking-[-0.15px]">
          <p id={titleId}>
            <span className="font-medium">Send with</span> Hide My Wallet
          </p>
          <HowItWorksSheet />
        </div>
        <Switch
          checked={hidden}
          onCheckedChange={setHidden}
          disabled={phase !== "review"}
          aria-labelledby={titleId}
        />
      </div>
      <div className="mt-[26px]">
        <SendButton hidden={hidden} phase={phase} onSend={() => setPhase("sending")} />
      </div>
    </MotionConfig>
  );
}
