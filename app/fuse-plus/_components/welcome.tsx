"use client";

import Link from "next/link";
import { XIcon } from "@phosphor-icons/react";
import { MotionConfig, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Benefits } from "./benefits";
import { GlowPlus } from "./glow-plus";
import { rise, sequence } from "./motion";

export function Welcome() {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial="hidden"
        animate="shown"
        variants={sequence}
        className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+16px)] md:justify-center md:py-12"
      >
        <motion.div variants={rise} className="-mr-1.5 flex justify-end pt-2">
          <Button
            nativeButton={false}
            render={<Link href="/home" />}
            aria-label="Close"
            size="icon-sm"
            className="relative bg-white/10 text-white/70 after:absolute after:-inset-1.5 hover:bg-white/15"
          >
            <XIcon size={15} weight="bold" aria-hidden />
          </Button>
        </motion.div>

        <GlowPlus />

        <motion.h1
          variants={rise}
          className="mt-5 text-center text-[22px] leading-7 font-semibold tracking-[-0.01em] text-balance text-white"
        >
          Welcome to Fuse Plus
        </motion.h1>
        <motion.p
          variants={rise}
          className="mx-auto mt-2 max-w-[290px] text-center text-[15px] leading-[21px] text-pretty text-white/40"
        >
          Your membership to earn more, pay less, and access premium benefits.
        </motion.p>

        <Benefits />

        <motion.div variants={rise} className="mt-auto pt-6 md:mt-0 md:pt-8">
          <Button nativeButton={false} render={<Link href="/home" />} variant="inverse" size="lg" className="w-full">
            Continue
          </Button>
        </motion.div>
      </motion.div>
    </MotionConfig>
  );
}
