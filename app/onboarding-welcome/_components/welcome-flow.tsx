"use client";

import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { GlimmField } from "./glimm-field";
import { AppleLogo, FuseLogo } from "./glyphs";
import { blurSwap, fade } from "./motion";
import { WordWheel } from "./word-wheel";

type Step = "welcome" | "signing" | "leaving";

const NEXT_ROUTE = "/onboarding-secure";

const cta = "text-[15px] tracking-[-0.01em] focus-visible:outline-white";

export function WelcomeFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const busy = step !== "welcome";

  useEffect(() => {
    if (step === "welcome") return;
    const id = step === "signing" ? setTimeout(() => setStep("leaving"), 1200) : setTimeout(() => router.push(NEXT_ROUTE), 300);
    return () => clearTimeout(id);
  }, [step, router]);

  return (
    <MotionConfig reducedMotion="user">
      <GlimmField />

      <motion.div
        inert={step === "leaving"}
        className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col"
        animate={step === "leaving" ? { opacity: 0, filter: "blur(8px)", y: 16 } : { opacity: 1, filter: "blur(0px)", y: 0 }}
        transition={fade}
      >
        <WordWheel />

        <section className="px-8 text-white min-[360px]:px-12">
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

        <div className="mt-8 flex flex-col gap-3 px-5 pb-[max(40px,calc(env(safe-area-inset-bottom)+12px))] min-[360px]:px-[30px]">
          <Button
            variant="inverse"
            size="lg"
            disabled={busy}
            focusableWhenDisabled
            aria-busy={busy}
            onClick={() => setStep("signing")}
            className={`grid place-items-center ${cta}`}
          >
            <AnimatePresence initial={false}>
              <motion.span key={busy ? "busy" : "idle"} {...blurSwap} className="col-start-1 row-start-1 flex items-center gap-2">
                {busy ? <Spinner aria-hidden className="size-[17px]" /> : <AppleLogo className="-mt-px size-[17px]" />}
                {busy ? "Signing in" : "Continue with Apple"}
              </motion.span>
            </AnimatePresence>
          </Button>
          <Button nativeButton={false} render={<Link href={NEXT_ROUTE} />} size="lg" className={`bg-white/15 text-white hover:bg-white/20 ${cta}`}>
            <span className="grid size-4 place-items-center rounded-[4px] bg-white text-[#1B7DF6]">
              <ArrowCounterClockwiseIcon weight="fill" size={11} />
            </span>
            Recover existing wallet
          </Button>
        </div>
      </motion.div>
    </MotionConfig>
  );
}
