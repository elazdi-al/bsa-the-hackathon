import { CheckIcon, ScanSmileyIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { blurSwap } from "./motion";

export type Phase = "review" | "checking" | "confirm" | "sending" | "sent";

const labels: Record<Phase, string> = {
  review: "Continue",
  checking: "Checking",
  confirm: "Send",
  sending: "Sending",
  sent: "Sent",
};

type Props = { phase: Phase; disabled?: boolean; onPress: () => void };

export function SendButton({ phase, disabled, onPress }: Props) {
  const busy = phase === "checking" || phase === "sending";
  return (
    <Button
      onClick={onPress}
      disabled={disabled || busy || phase === "sent"}
      focusableWhenDisabled
      aria-busy={busy}
      // Stays focusable while busy; dims only when there is nothing to press yet.
      className={`relative w-full tracking-[-0.3px] aria-disabled:active:scale-100 ${disabled && !busy ? "opacity-35" : ""}`}
    >
      <AnimatePresence initial={false}>
        <motion.span key={phase} className="absolute inset-0 flex items-center justify-center gap-2 whitespace-nowrap" {...blurSwap}>
          {busy && <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
          {phase === "confirm" && <ScanSmileyIcon aria-hidden weight="bold" className="size-[18px]" />}
          {phase === "sent" && <CheckIcon aria-hidden weight="bold" className="size-[18px]" />}
          {labels[phase]}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only" aria-live="polite">
        {busy || phase === "sent" ? labels[phase] : ""}
      </span>
    </Button>
  );
}
