"use client";

import Link from "next/link";
import { XIcon } from "@phosphor-icons/react";
import { MotionConfig, motion } from "motion/react";
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
        className="flex min-h-dvh flex-col px-4 pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+16px)]"
      >
        <motion.div variants={rise} className="-mr-1.5 flex justify-end pt-2">
          <Link
            href="/home"
            aria-label="Close"
            className="group grid size-11 place-items-center rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-white"
          >
            <span className="grid size-8 place-items-center rounded-full bg-white/10 text-white/70 transition-[scale,background-color] duration-150 ease-out group-hover:bg-white/15 group-active:scale-[0.96]">
              <XIcon size={15} weight="bold" aria-hidden />
            </span>
          </Link>
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

        <motion.div variants={rise} className="mt-auto pt-6">
          <Link
            href="/home"
            className="flex h-14 items-center justify-center rounded-full bg-white text-[17px] font-semibold text-black outline-offset-2 transition-[scale,background-color] duration-150 ease-out hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-white active:scale-[0.96]"
          >
            Continue
          </Link>
        </motion.div>
      </motion.div>
    </MotionConfig>
  );
}
