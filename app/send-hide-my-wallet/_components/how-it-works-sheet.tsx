import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef } from "react";
import { howItWorks } from "../data";
import { ShieldLeftHalf } from "./icons";
import { easeOut, fade, springs } from "./motion";

type Props = { open: boolean; onClose: () => void };

export function HowItWorksSheet({ open, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);

  // The dialog stays modal until the exit animation ends; close() then hands focus back to the trigger.
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className="fixed inset-0 m-0 size-full outline-none max-h-none max-w-none overflow-hidden bg-transparent p-0 backdrop:bg-transparent"
    >
      <AnimatePresence onExitComplete={() => dialog.current?.close()}>
        {open && (
          <motion.div
            key="scrim"
            aria-hidden
            onClick={onClose}
            className="absolute inset-0 bg-white/45 backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
          />
        )}
        {open && (
          <motion.div
            key="sheet"
            className="absolute inset-x-0 bottom-0 mx-auto max-w-[430px] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            initial={{ y: "110%" }}
            animate={{ y: 0, transition: springs.sheet }}
            exit={{ y: "110%", transition: { duration: 0.24, ease: easeOut } }}
          >
            <div className="rounded-[44px] bg-white p-5 pt-7 shadow-[0_0_0_1px_rgb(0_0_0/0.04),0_12px_48px_rgb(0_0_0/0.14)]">
              <div className="px-3 tracking-[-0.24px]">
                <span className="grid size-12 place-items-center rounded-full bg-fuse-blue/10 text-fuse-blue">
                  <ShieldLeftHalf className="h-6 w-5" />
                </span>
                <h2 id={titleId} className="mt-4 text-[20px] font-semibold tracking-[-0.01em]">
                  Hide My Wallet
                </h2>
                <p className="mt-1 text-[15px] leading-5 text-pretty text-black/45">
                  Send without revealing the wallet your money lives in.
                </p>
                <ul className="mt-6 flex flex-col gap-4">
                  {howItWorks.map(({ icon: Icon, title, body }) => (
                    <li key={title} className="flex gap-3.5">
                      <Icon aria-hidden weight="duotone" className="mt-px size-[22px] shrink-0 text-fuse-blue" />
                      <p className="text-[15px] leading-5">
                        <span className="font-medium">{title}</span>
                        <span className="block text-pretty text-black/45">{body}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-7 h-12 w-full rounded-full bg-black text-[16px] font-medium text-white outline-offset-2 outline-fuse-blue transition-transform duration-150 ease-out focus-visible:outline-2 active:scale-[0.96]"
              >
                Got it
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}
