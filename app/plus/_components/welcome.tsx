"use client";

import { MotionConfig, motion } from "motion/react";
import { useBack } from "@/components/navigation";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { DemoTag } from "@/components/ui/demo-tag";
import { Benefits } from "./benefits";
import { GlowPlus } from "./glow-plus";
import { rise, sequence } from "./motion";

export function Welcome() {
  const back = useBack("/home");

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial="hidden"
        animate="shown"
        variants={sequence}
        className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+16px)] md:justify-center md:py-12"
      >
        <motion.div variants={rise} className="flex justify-end pt-2">
          <BackButton kind="close" tone="dark" fallback="/home" />
        </motion.div>

        <GlowPlus />

        <motion.div variants={rise} className="mt-5 flex justify-center">
          <DemoTag className="text-white/60" />
        </motion.div>

        <motion.h1
          variants={rise}
          className="mt-2 text-center text-title text-balance text-white"
        >
          Welcome to Swissquote Plus
        </motion.h1>
        <motion.p
          variants={rise}
          className="mx-auto mt-2 max-w-[290px] text-center text-body text-balance text-white/55"
        >
          Your membership for bank transfers, card spending and premium benefits.
        </motion.p>

        <Benefits />

        <motion.div variants={rise} className="mt-auto pt-6 md:mt-0 md:pt-8">
          <Button onClick={back} variant="inverse" size="lg" className="w-full focus-visible:outline-white/60">
            Continue
          </Button>
        </motion.div>
      </motion.div>
    </MotionConfig>
  );
}
