import { AnimatePresence, motion } from "motion/react";
import { CheckIcon, FaceIdIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
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
      size="lg"
      className={cn("relative w-full aria-disabled:active:scale-100", disabled && !busy && "opacity-35")}
    >
      <AnimatePresence initial={false}>
        <motion.span key={phase} className="absolute inset-0 flex items-center justify-center gap-2 whitespace-nowrap" {...blurSwap}>
          {busy && <Spinner aria-hidden className="size-5" />}
          {phase === "confirm" && <FaceIdIcon size={20} />}
          {phase === "sent" && <CheckIcon size={20} />}
          {labels[phase]}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only" aria-live="polite">
        {busy || phase === "sent" ? labels[phase] : ""}
      </span>
    </Button>
  );
}
