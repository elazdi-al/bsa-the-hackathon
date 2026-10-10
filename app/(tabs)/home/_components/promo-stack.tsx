"use client";

import { XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, stagger, type Variants } from "motion/react";
import Link from "next/link";
import { useEffect, useReducer, type ReactNode } from "react";
import { promoInterval, promos, type Promo } from "../data";
import { tileSurface } from "./asset-tile";
import { FuseEarnIcon, FusePlusIcon, GlassesIcon } from "./icons";
import { blurred, leave, reveal, sharp, smooth } from "../../_components/transitions";

type Action = "advance" | "dismiss" | "restore";
type State = { cards: Promo[]; index: number; last: Action };

function reducer(state: State, action: Action): State {
  switch (action) {
    case "advance":
      return { ...state, index: (state.index + 1) % state.cards.length, last: action };
    case "dismiss": {
      const cards = state.cards.filter((_, i) => i !== state.index);
      return { cards, index: cards.length ? state.index % cards.length : 0, last: action };
    }
    case "restore":
      return { cards: promos, index: 0, last: action };
  }
}

const icons: Record<Promo["id"], ReactNode> = { "fuse-plus": <FusePlusIcon />, earn: <FuseEarnIcon /> };

// The card itself only slides (after a dismiss, the next card arrives from the right);
// its icon and copy blur through in sequence, icon first.
const card: Variants = {
  hidden: (last: Action) => ({ x: last === "dismiss" ? 44 : 0 }),
  shown: { x: 0, transition: { ...smooth, delayChildren: stagger(0.07, { startDelay: 0.12 }) } },
  gone: { transition: { delayChildren: stagger(0.05) } },
};
const part: Variants = {
  hidden: { opacity: 0, filter: blurred, scale: 0.96 },
  shown: { opacity: 1, filter: sharp, scale: 1, transition: reveal },
  gone: { opacity: 0, filter: blurred, scale: 0.98, transition: leave },
};
const layer = {
  initial: { opacity: 0, filter: blurred, scale: 1.04 },
  animate: { opacity: 1, filter: sharp, scale: 1, transition: reveal },
  exit: { opacity: 0, filter: blurred, scale: 0.98, transition: leave },
};

export function PromoStack({ className }: { className: string }) {
  const [{ cards, index, last }, dispatch] = useReducer(reducer, { cards: promos, index: 0, last: "restore" });
  const current = cards.at(index);

  useEffect(() => {
    if (cards.length < 2) return;
    const timer = setTimeout(() => dispatch("advance"), promoInterval);
    return () => clearTimeout(timer);
  }, [cards, index]);

  return (
    <div className={`relative ${className}`}>
      <AnimatePresence initial={false}>
        {current ? (
          <motion.section key="stack" aria-label="Promotions" className={`absolute inset-0 overflow-hidden ${tileSurface}`} {...layer}>
            <AnimatePresence initial={false} custom={last}>
              <motion.div
                key={current.id}
                custom={last}
                variants={card}
                initial="hidden"
                animate="shown"
                exit="gone"
                className="absolute inset-0"
              >
                <PromoCard promo={current}>
                  <motion.span variants={part} className="absolute top-5 left-5">
                    {icons[current.id]}
                  </motion.span>
                  <motion.span variants={part} className="absolute bottom-5 left-5 text-[15px] leading-[18px] font-medium">
                    {current.title[0]}
                    <br />
                    {current.title[1]}
                  </motion.span>
                </PromoCard>
              </motion.div>
            </AnimatePresence>

            {cards.length > 1 && (
              <div aria-hidden className="pointer-events-none absolute bottom-[62px] left-5 flex gap-1">
                {cards.map((c, i) => (
                  <span
                    key={c.id}
                    className={`size-1 rounded-full transition-colors duration-300 ${i === index ? "bg-black" : "bg-[#d4d4d4]"}`}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              aria-label="Dismiss promotion"
              onClick={() => dispatch("dismiss")}
              className="absolute top-1.5 right-1.5 z-10 grid size-11 place-items-center rounded-full text-[#c8c8c8] outline-none transition-[color,scale] duration-150 hover:text-[#a0a0a0] focus-visible:ring-2 focus-visible:ring-black/20 active:scale-[0.96]"
            >
              <XIcon weight="bold" size={14} />
            </button>
          </motion.section>
        ) : (
          <motion.button
            key="empty"
            type="button"
            onClick={() => dispatch("restore")}
            className="absolute inset-0 flex flex-col items-start rounded-[22px] border border-dashed border-black/10 bg-white p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-black/20"
            whileTap={{ scale: 0.96 }}
            {...layer}
          >
            <GlassesIcon />
            <span className="mt-auto text-[14px] leading-[18px] text-[#c4c4c4]">
              Tap to bring back
              <br />
              the promo cards
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function PromoCard({ promo, children }: { promo: Promo; children: ReactNode }) {
  return promo.href ? (
    <Link
      href={promo.href}
      transitionTypes={["push"]}
      aria-label={promo.title.join(" ")}
      className="absolute inset-0 rounded-[22px] outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-inset"
    >
      {children}
    </Link>
  ) : (
    <div className="absolute inset-0">{children}</div>
  );
}
