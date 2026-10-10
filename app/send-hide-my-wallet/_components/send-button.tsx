import { CheckCircleIcon, ScanSmileyIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, stagger, type Variants } from "motion/react";
import { Button } from "@/components/ui/button";
import { hideMyWalletWords } from "../data";
import { blurSwap, easeOut, labelSpring } from "./motion";

export type Phase = "review" | "sending" | "sent";

const words: Variants = {
  hidden: { opacity: 0, filter: "blur(6px)", transition: { duration: 0.16, ease: easeOut } },
  shown: { opacity: 1, filter: "blur(0px)", transition: { duration: 0.24, ease: easeOut } },
};

const wordGroup: Variants = {
  hidden: { transition: { delayChildren: stagger(0.02, { from: "last" }) } },
  shown: { transition: { delayChildren: stagger(0.035, { startDelay: 0.06 }) } },
};

type Props = { hidden: boolean; phase: Phase; onSend: () => void };

export function SendButton({ hidden, phase, onSend }: Props) {
  return (
    <Button
      onClick={onSend}
      disabled={phase !== "review"}
      focusableWhenDisabled
      className="relative w-full tracking-[-0.3px] aria-disabled:active:scale-100"
    >
      <span
        aria-hidden
        className={`absolute inset-0 rounded-[inherit] bg-fuse-blue transition-opacity duration-150 ease-out ${hidden ? "opacity-100" : "opacity-0"}`}
      />
      <AnimatePresence initial={false}>
        <motion.span
          key={phase}
          className="absolute inset-0 flex items-center justify-center whitespace-nowrap"
          {...blurSwap}
        >
          {phase === "review" && (
            <>
              <motion.span layout="position" transition={labelSpring} className="flex items-center gap-2">
                <ScanSmileyIcon aria-hidden weight="bold" className="size-[18px]" />
                Send
              </motion.span>
              <AnimatePresence mode="popLayout" initial={false}>
                {hidden && (
                  <motion.span
                    key="hide-my-wallet"
                    className="flex gap-[0.25em] pl-[0.25em]"
                    variants={wordGroup}
                    initial="hidden"
                    animate="shown"
                    exit="hidden"
                  >
                    {hideMyWalletWords.map((word) => (
                      <motion.span key={word} variants={words}>
                        {word}
                      </motion.span>
                    ))}
                  </motion.span>
                )}
              </AnimatePresence>
            </>
          )}
          {phase === "sending" && (
            <span className="flex items-center gap-2.5">
              <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Sending
            </span>
          )}
          {phase === "sent" && (
            <span className="flex items-center gap-2">
              <CheckCircleIcon aria-hidden weight="fill" className="size-5" />
              Sent
            </span>
          )}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only" aria-live="polite">
        {phase === "sending" ? "Sending" : phase === "sent" ? "Sent" : ""}
      </span>
    </Button>
  );
}
