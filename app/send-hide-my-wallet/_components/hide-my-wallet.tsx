"use client";

import { MotionConfig } from "motion/react";
import { useRouter } from "next/navigation";
import { sendDraft } from "@/app/choose-recipient/data";
import { useEffect, useId, useState } from "react";
import { ShieldIcon } from "@/components/icons";
import { Switch } from "@/components/ui/switch";
import { transfer } from "../data";
import { HowItWorksSheet } from "./how-it-works-sheet";
import { SendButton, type Phase } from "./send-button";

const SENDING_MS = 1400;
const SENT_MS = 900;

export function HideMyWallet({ to, label }: { to?: string; label: string }) {
  const router = useRouter();
  const titleId = useId();
  const [hidden, setHidden] = useState(false);
  const [phase, setPhase] = useState<Phase>("review");

  useEffect(() => {
    if (to) sendDraft.set(to);
  }, [to]);

  useEffect(() => {
    if (phase === "review") return;
    const id = setTimeout(() => {
      if (phase === "sending") return setPhase("sent");
      sendDraft.clear();
      // Replace, so Back from History can't land on a review that's already sent.
      router.replace(`/history?${new URLSearchParams({ sent: label, amount: String(transfer.usd) })}`, {
        transitionTypes: ["pop"],
      });
    }, phase === "sending" ? SENDING_MS : SENT_MS);
    return () => clearTimeout(id);
  }, [phase, router, label]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex items-center gap-4">
        <ShieldIcon className="shrink-0 text-fuse-blue" />
        <div className="min-w-0 flex-1">
          <p id={titleId} className="text-label">
            Hide My Wallet
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
      <div className="mt-6">
        <SendButton hidden={hidden} phase={phase} onSend={() => setPhase("sending")} />
      </div>
    </MotionConfig>
  );
}
