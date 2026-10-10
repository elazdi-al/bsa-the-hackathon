import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { WalletKey } from "../data";
import { blurSwap } from "./motion";

export function CreateButton({ item, busy, onPress }: { item: WalletKey; busy: boolean; onPress: () => void }) {
  const label = busy ? item.cta?.busy : item.cta?.idle;
  return (
    <Button
      size="lg"
      onClick={onPress}
      disabled={busy}
      focusableWhenDisabled
      aria-busy={busy}
      className="grid w-full place-items-center overflow-hidden data-disabled:active:scale-100"
    >
      <AnimatePresence initial={false}>
        <motion.span key={label} {...blurSwap} className="col-start-1 row-start-1 flex items-center gap-2">
          {busy ? <Spinner aria-hidden className="size-5" /> : <item.Icon size={20} style={{ color: item.accent }} />}
          {label}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}
