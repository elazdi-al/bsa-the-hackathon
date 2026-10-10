"use client";

import { AppleLogoIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppleSheet, SHEET_STATUS, type SheetStep } from "./apple-sheet";
import { FaceIdHud, type HudGlyph } from "./face-id-hud";
import { GlimmField } from "./glimm-field";
import { FuseLogo } from "./glyphs";
import { fade } from "./motion";
import { WordWheel } from "./word-wheel";

type Step = "welcome" | SheetStep | "closing" | "leaving";

const NEXT_ROUTE = "/onboarding-secure";

/** Steps that advance on their own after a mock delay (ms). */
const AUTO: Partial<Record<Step, [next: Step, after: number]>> = {
  "face-id": ["scanning", 300],
  scanning: ["matched", 600],
  matched: ["signing", 500],
  signing: ["done", 450],
  done: ["closing", 600],
  closing: ["leaving", 500],
};

const HUD: Partial<Record<Step, HudGlyph>> = { "face-id": "scan", scanning: "spin", matched: "match" };

const isSheetStep = (step: Step): step is SheetStep => step === "prompt" || step in SHEET_STATUS;

const pill =
  "flex h-[55px] w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold tracking-[-0.01em] transition-transform duration-150 ease-out active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export function WelcomeFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");

  useEffect(() => {
    if (step === "leaving") {
      const id = setTimeout(() => router.push(NEXT_ROUTE), 300);
      return () => clearTimeout(id);
    }
    const auto = AUTO[step];
    if (!auto) return;
    const id = setTimeout(() => setStep(auto[0]), auto[1]);
    return () => clearTimeout(id);
  }, [step, router]);

  const close = useCallback(() => setStep("welcome"), []);
  const signIn = useCallback(() => setStep("face-id"), []);
  const hud = HUD[step];

  return (
    <MotionConfig reducedMotion="user">
      <GlimmField />

      <motion.div
        inert={step !== "welcome"}
        className="relative flex min-h-dvh flex-col"
        animate={step === "leaving" ? { opacity: 0, filter: "blur(8px)", y: 16 } : { opacity: 1, filter: "blur(0px)", y: 0 }}
        transition={fade}
      >
        <WordWheel />

        <section className="px-12 text-white">
          <div className="grid size-[42px] place-items-center rounded-[11px] bg-white text-black shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
            <FuseLogo className="size-[17px]" />
          </div>
          <h1 className="mt-[13px] text-[30px] leading-[35px] font-medium tracking-[-0.02em] text-balance">
            Your money,
            <br />
            upgraded
          </h1>
          <p className="mt-[18px] text-[13px] leading-[18px] text-white/65">
            Save, earn and invest
            <br />
            with stablecoins and digital assets.
          </p>
        </section>

        <div className="mt-8 flex flex-col gap-3 px-[30px] pb-[max(40px,calc(env(safe-area-inset-bottom)+12px))]">
          <button type="button" onClick={() => setStep("prompt")} className={`${pill} bg-white text-black shadow-[0_1px_3px_rgb(0_0_0/0.08)]`}>
            <AppleLogoIcon weight="fill" size={17} className="-mt-px" />
            Continue with Apple
          </button>
          <Link href={NEXT_ROUTE} className={`${pill} bg-white/15 text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]`}>
            <span className="grid size-4 place-items-center rounded-[4px] bg-white text-[#1B7DF6]">
              <ArrowCounterClockwiseIcon weight="fill" size={11} />
            </span>
            Recover existing wallet
          </Link>
        </div>
      </motion.div>

      <AnimatePresence>
        {isSheetStep(step) && (
          <motion.div key="dim" aria-hidden className="absolute inset-0 z-10 bg-black/80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} />
        )}
        {isSheetStep(step) && <AppleSheet key="sheet" step={step} onClose={close} onSignIn={signIn} />}
        {hud && <FaceIdHud key="hud" glyph={hud} />}
      </AnimatePresence>
    </MotionConfig>
  );
}
