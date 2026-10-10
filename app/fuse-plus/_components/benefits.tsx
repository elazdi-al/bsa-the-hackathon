import type { ReactNode } from "react";
import { BankIcon, LightningIcon, SelectionIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { benefits, type Benefit } from "../data";
import { rise, surface } from "./motion";

export function Benefits() {
  return (
    <motion.section variants={surface} aria-label="Fuse Plus benefits" className="mt-7 rounded-[32px] bg-[#0d0f12]">
      <ul className="flex flex-col gap-8 pt-8 pr-5 pb-7 pl-6">
        {benefits.map((benefit) => (
          <motion.li key={benefit.title} variants={rise} className="flex items-center gap-[18px]">
            <span className="flex w-7 shrink-0 justify-center">{icons[benefit.icon]}</span>
            <div>
              <h2 className="text-[16px] leading-[22px] font-medium tracking-[-0.01em] text-white">{benefit.title}</h2>
              <p className="mt-0.5 text-[15px] leading-5 text-pretty text-white/35">{benefit.body}</p>
            </div>
          </motion.li>
        ))}
      </ul>
      <motion.p
        variants={rise}
        className="flex items-center justify-center gap-3 border-t border-white/[0.07] py-7 text-[15px] leading-5 text-white/35"
      >
        <SelectionIcon weight="duotone" size={24} aria-hidden />
        More features are coming soon
      </motion.p>
    </motion.section>
  );
}

const icons: Record<Benefit["icon"], ReactNode> = {
  bolt: (
    <LightningIcon weight="fill" size={30} color="url(#fuse-plus-bolt)" aria-hidden>
      <IconGradient id="fuse-plus-bolt" from="#22d55a" to="#7ae69c" />
    </LightningIcon>
  ),
  bank: (
    <BankIcon weight="fill" size={30} color="url(#fuse-plus-bank)" aria-hidden>
      <IconGradient id="fuse-plus-bank" from="#f25c5c" to="#ff9d9d" />
    </BankIcon>
  ),
  visa: <VisaWordmark />,
};

function IconGradient({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={from} />
        <stop offset="1" stopColor={to} />
      </linearGradient>
    </defs>
  );
}

function VisaWordmark() {
  return (
    <svg viewBox="0 8.2 24 7.6" fill="white" aria-hidden className="w-7">
      <path d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z" />
    </svg>
  );
}
