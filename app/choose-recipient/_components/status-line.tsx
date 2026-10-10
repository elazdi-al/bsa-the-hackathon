import { FlowerIcon, SealCheckIcon, SealWarningIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { shortAddress, type Resolution } from "../data";
import { blurSwap, iconPop } from "./motion";

export type Status = { kind: "hint" } | { kind: "resolving" } | Resolution;

export function StatusLine({ id, status }: { id: string; status: Status }) {
  const { icon, text } = describe(status);

  return (
    <p id={id} aria-live="polite" className="relative mt-[3px] h-4 text-[12px] leading-4 text-black/35">
      <AnimatePresence initial={false}>
        <motion.span
          key={status.kind === "resolved" ? status.address : status.kind}
          variants={blurSwap}
          initial="hidden"
          animate="shown"
          exit="hidden"
          className="absolute inset-0 flex items-center gap-1"
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
      return { icon: null, text: "Enter a Base address or ENS name" };
    case "resolving":
      return {
        icon: <FlowerIcon weight="fill" size={14} className="text-fuse-blue motion-safe:animate-spin" />,
        text: "Resolving...",
      };
    case "resolved":
      return {
        icon: <SealCheckIcon weight="fill" size={16} className="text-positive" />,
        text: shortAddress(status.address),
      };
    case "notFound":
      return {
        icon: <SealWarningIcon weight="fill" size={16} className="text-negative" />,
        text: "Name not found",
      };
  }
}
