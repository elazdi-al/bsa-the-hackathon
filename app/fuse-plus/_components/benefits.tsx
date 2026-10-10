import type { ReactNode } from "react";
import { motion } from "motion/react";
import { BankIcon, CardIcon, GridIcon, LightningIcon } from "@/components/icons";
import { benefits, type Benefit } from "../data";
import { rise, surface } from "./motion";

export function Benefits() {
  return (
    <motion.section variants={surface} aria-label="Fuse Plus benefits" className="mt-10 px-2">
      <ul className="flex flex-col gap-7">
        {benefits.map((benefit) => (
          <motion.li key={benefit.title} variants={rise} className="flex items-center gap-4">
            {icons[benefit.icon]}
            <div>
              <h2 className="text-label text-white">{benefit.title}</h2>
              <p className="mt-0.5 text-body text-pretty text-white/55">{benefit.body}</p>
            </div>
          </motion.li>
        ))}
      </ul>
      <motion.p variants={rise} className="mt-7 flex items-center gap-4 text-body text-white/55">
        <span className="flex w-8 shrink-0 justify-center">
          <GridIcon size={24} className="text-white/40" />
        </span>
        More features are coming soon
      </motion.p>
    </motion.section>
  );
}

const icons: Record<Benefit["icon"], ReactNode> = {
  bolt: <LightningIcon size={32} className="shrink-0 text-positive" />,
  bank: <BankIcon size={32} className="shrink-0 text-orange" />,
  card: <CardIcon size={32} className="shrink-0 text-purple" />,
};
