import { AnimatePresence, motion } from "motion/react";
import { VerifiedIcon, WarningIcon } from "@/components/icons";
import { Spinner } from "@/components/ui/spinner";
import { shortAddress, type Resolution } from "../data";
import { blurSwap, iconPop } from "./motion";

export type Status = { kind: "hint" } | { kind: "resolving" } | Resolution;

export function StatusLine({ id, status }: { id: string; status: Status }) {
  const { icon, text } = describe(status);

  return (
    <p id={id} aria-live="polite" className="relative mt-2 h-5 text-body text-muted-foreground">
      <AnimatePresence initial={false}>
        <motion.span
          key={status.kind === "resolved" ? status.address : status.kind}
          variants={blurSwap}
          initial="hidden"
          animate="shown"
          exit="hidden"
          className="absolute inset-0 flex items-center gap-1.5"
        >
          {icon && (
            <motion.span variants={iconPop} className="grid size-4 place-items-center">
              {icon}
            </motion.span>
          )}
          {text}
        </motion.span>
      </AnimatePresence>
    </p>
  );
}

function describe(status: Status) {
  switch (status.kind) {
    case "hint":
      return { icon: null, text: null };
    case "resolving":
      return {
        icon: <Spinner aria-hidden className="text-brand motion-reduce:animate-none" />,
        text: "Resolving...",
      };
    case "resolved":
      return {
        icon: <VerifiedIcon size={16} className="text-positive" />,
        text: shortAddress(status.address),
      };
    case "notFound":
      return {
        icon: <WarningIcon size={16} className="text-negative" />,
        text: "Name not found",
      };
  }
}
