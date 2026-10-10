"use client";

import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { cn } from "cn";
import { blurred, leave, sharp } from "@/app/(tabs)/_components/transitions";
import { buttonVariants } from "@/components/ui/button";
import { GlimmField } from "./glimm-field";
import { FuseLogo } from "./glyphs";
import { WordWheel } from "./word-wheel";

/** Both buttons leave the same way, to their own route. The client is already signed in to Swissquote. */
const ROUTES = { create: "/onboarding-secure", recover: "/pending-verification" } as const;
type Step = "welcome" | keyof typeof ROUTES;

/** The hand-off: a house exit held a little longer, and the push waits for it. */
const handOff = { ...leave, duration: 0.3 };

const cta = "text-[15px] tracking-[-0.01em] focus-visible:outline-white";

export function WelcomeFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const exiting = step !== "welcome";

  useEffect(() => {
    if (step === "welcome") return;
    const id = setTimeout(() => router.push(ROUTES[step]), handOff.duration * 1000);
    return () => clearTimeout(id);
  }, [step, router]);

  const leaveTo = (to: keyof typeof ROUTES) => (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    setStep(to);
  };

  return (
    <MotionConfig reducedMotion="user">
      <GlimmField />

      <motion.div
        inert={exiting}
        className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col"
        animate={exiting ? { opacity: 0, filter: blurred, y: 16 } : { opacity: 1, filter: sharp, y: 0 }}
        transition={handOff}
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
          <Link href={ROUTES.create} onClick={leaveTo("create")} className={cn(buttonVariants({ variant: "inverse", size: "lg" }), cta)}>
            Create wallet
          </Link>
          <Link
            href={ROUTES.recover}
            onClick={leaveTo("recover")}
            className={cn(buttonVariants({ size: "lg" }), "bg-white/15 text-white hover:bg-white/20", cta)}
          >
            <span className="grid size-4 place-items-center rounded-[4px] bg-white text-[#1B7DF6]">
              <ArrowCounterClockwiseIcon weight="fill" size={11} />
            </span>
            Recover existing wallet
          </Link>
        </div>
      </motion.div>
    </MotionConfig>
  );
}
