import { AnimatePresence, motion } from "motion/react";
import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Icon } from "@/components/icons";
import { blurSwap } from "./motion";

type Props = { label: string; Icon?: Icon; accent?: string; busy: boolean; error?: string; onPress: (event: MouseEvent) => void };

export function CreateButton({ label, Icon, accent, busy, error, onPress }: Props) {
  return (
    <>
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
            {busy ? <Spinner aria-hidden className="size-5" /> : Icon && <Icon size={20} style={{ color: accent }} />}
            {label}
          </motion.span>
        </AnimatePresence>
      </Button>
      {error && (
        <p role="alert" className="mt-3 text-center text-caption text-negative">
          {error}
        </p>
      )}
    </>
  );
}
