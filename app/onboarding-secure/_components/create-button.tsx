import { AnimatePresence, motion } from "motion/react";
import type { WalletKey } from "../data";
import { KeyIcon, Spinner } from "./icons";
import { blurSwap } from "./motion";

export function CreateButton({ item, busy, onPress }: { item: WalletKey; busy: boolean; onPress: () => void }) {
  const label = busy ? item.cta?.busy : item.cta?.idle;
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={busy}
      aria-busy={busy}
      className="grid h-14 w-full place-items-center overflow-hidden rounded-full bg-black text-[17px] font-semibold text-white transition-transform duration-150 ease-out outline-offset-4 active:scale-[0.96] disabled:active:scale-100"
    >
      <AnimatePresence initial={false}>
        <motion.span key={label} {...blurSwap} className="col-start-1 row-start-1 flex items-center gap-2">
          {busy ? <Spinner size={18} /> : <KeyIcon id={item.id} size={20} />}
          {label}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
