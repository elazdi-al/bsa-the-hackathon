import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { blurred, sharp, swap } from "./motion";

export function CopyButton({ text, label, children }: { text: string; label: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const reset = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(reset);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard unavailable (insecure context or denied): no false confirmation.
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={copy}
        className="relative z-10 flex items-center gap-1.5 rounded-md transition-transform duration-150 ease-out outline-none after:absolute after:-inset-x-2 after:-inset-y-3 focus-visible:ring-2 focus-visible:ring-[#1171ee] active:scale-[0.96]"
      >
        {children}
        <span className="grid size-4 place-items-center text-[#a5a5a5]">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={copied ? "check" : "copy"}
              className="flex"
              initial={{ ...blurred, scale: 0.25 }}
              animate={sharp}
              exit={{ ...blurred, scale: 0.25 }}
              transition={swap}
            >
              {copied ? <CheckIcon size={14} weight="bold" /> : <CopyIcon size={16} weight="duotone" />}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </>
  );
}
