import { XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { APPLE_ACCOUNT } from "../data";
import { AccountAvatar, FaceIdGlyph, FuseLogo } from "./glyphs";
import { blurSwap, sheet } from "./motion";

/** What the sheet footer shows once Sign In has been tapped. */
export const SHEET_STATUS = {
  "face-id": { glyph: "face-id", label: "Face ID" },
  scanning: { glyph: "spinner", label: "Face ID" },
  matched: { glyph: "spinner", label: "Signing in…" },
  signing: { glyph: "spinner", label: "Signing in…" },
  done: { glyph: "check", label: "Done" },
} as const;

export type SheetStep = "prompt" | keyof typeof SHEET_STATUS;

type Props = { step: SheetStep; onClose: () => void; onSignIn: () => void };

/** In-app rebuild of the system Sign in with Apple sheet. */
export function AppleSheet({ step, onClose, onSignIn }: Props) {
  const closable = step === "prompt";
  const signInRef = useRef<HTMLButtonElement>(null);

  // autoFocus would scroll the page to the still off-screen sheet; focus without scrolling instead.
  useEffect(() => signInRef.current?.focus({ preventScroll: true }), []);

  useEffect(() => {
    if (!closable) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closable, onClose]);

  return (
    <motion.section
      role="dialog"
      aria-modal
      aria-labelledby="apple-sheet-title"
      className="absolute inset-x-0 bottom-0 z-20 rounded-t-[30px] bg-[#F2F2F7] px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))]"
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={sheet}
    >
      <div className="flex h-[34px] items-center justify-between pl-1">
        <h2 id="apple-sheet-title" className="text-[17px] font-semibold tracking-[-0.01em]">
          Sign in with Apple
        </h2>
        <button
          type="button"
          aria-label="Close"
          disabled={!closable}
          onClick={onClose}
          className="relative grid size-[30px] place-items-center rounded-full bg-[#E3E3E8] text-[#85858B] transition-[opacity,scale] duration-150 ease-out after:absolute after:-inset-[7px] active:scale-[0.96] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B7EF7]"
        >
          <XIcon weight="bold" size={15} />
        </button>
      </div>

      <div className="mx-auto mt-[21px] grid size-[54px] place-items-center rounded-[13px] bg-[#2A2A2F] text-white">
        <FuseLogo className="size-[28px]" />
      </div>
      <p className="mx-auto mt-[14px] max-w-[300px] text-center text-[15px] leading-[21px] text-pretty">
        Sign in to {APPLE_ACCOUNT.app} using your Apple Account.
      </p>

      <div className="mt-[25px] flex h-[61px] items-center gap-3 rounded-[14px] bg-white px-4">
        <AccountAvatar className="size-9 shrink-0 rounded-full outline-1 -outline-offset-1 outline-black/10" />
        <div className="min-w-0">
          <p className="truncate text-[17px] leading-[22px]">{APPLE_ACCOUNT.name}</p>
          <p className="text-[13px] leading-4 text-[#8A8A8E]">{APPLE_ACCOUNT.caption}</p>
        </div>
      </div>

      <div className="relative mt-4 h-24">
        <AnimatePresence initial={false}>
          {step === "prompt" ? (
            <motion.div key="sign-in" className="absolute inset-x-0 top-8 flex justify-center" {...blurSwap}>
              <button
                ref={signInRef}
                type="button"
                onClick={onSignIn}
                className="h-[43px] w-[105px] rounded-[12px] bg-[#0B7EF7] text-[17px] font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B7EF7]"
              >
                Sign In
              </button>
            </motion.div>
          ) : (
            <motion.div key="status" role="status" className="absolute inset-x-0 top-4 flex flex-col items-center gap-2.5" {...blurSwap}>
              <div className="grid size-[52px] place-items-center">
                <AnimatePresence initial={false}>
                  <motion.div key={SHEET_STATUS[step].glyph} className="col-start-1 row-start-1" {...blurSwap}>
                    <StatusGlyph glyph={SHEET_STATUS[step].glyph} />
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="grid h-5 w-full">
                <AnimatePresence initial={false}>
                  <motion.p key={SHEET_STATUS[step].label} className="col-start-1 row-start-1 text-center text-[15px] leading-5" {...blurSwap}>
                    {SHEET_STATUS[step].label}
                  </motion.p>
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

function StatusGlyph({ glyph }: { glyph: (typeof SHEET_STATUS)[keyof typeof SHEET_STATUS]["glyph"] }) {
  if (glyph === "face-id") return <FaceIdGlyph className="size-[46px] text-[#8E8E93]" />;
  if (glyph === "spinner")
    return (
      <motion.svg
        viewBox="0 0 52 52"
        fill="none"
        className="size-[52px] text-[#0B7EF7]"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, ease: "linear", repeat: Infinity }}
        aria-hidden
      >
        <circle cx={26} cy={26} r={24} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="128 23" />
      </motion.svg>
    );
  return (
    <svg viewBox="0 0 52 52" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="size-[52px] text-[#0B7EF7]" aria-hidden>
      <circle cx={26} cy={26} r={24} />
      <motion.path d="M16 27l7 7 13-15" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1], delay: 0.08 }} />
    </svg>
  );
}
