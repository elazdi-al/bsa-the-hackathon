"use client";

import { AnimatePresence, motion, stagger, type Variants } from "motion/react";
import Link from "next/link";
import { useEffect, useReducer, type ReactNode } from "react";
import { CloseIcon, RestoreIcon } from "@/components/icons";
import { DemoTag } from "@/components/ui/demo-tag";
import { promoInterval, promos, type Promo, type TileId } from "../data";
import { EarnAppIcon, PlusAppIcon } from "./icons";
import { blurred, leave, reveal, sharp, smooth } from "../../_components/transitions";
import { useWallet } from "../../_components/wallet";

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

const icons: Record<Promo["id"], ReactNode> = { "plus": <PlusAppIcon />, earn: <EarnAppIcon /> };

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

export function PromoStack({ className, onOpenAccount }: { className: string; onOpenAccount: (id: TileId) => void }) {
  const [{ cards, index, last }, dispatch] = useReducer(reducer, { cards: promos, index: 0, last: "restore" });
  const snapshot = useWallet();
  const member = snapshot.status === "ready" && snapshot.wallet.plus !== null;
  const promo = cards.at(index);
  const current = member && promo?.member ? { ...promo, title: promo.member } : promo;

  useEffect(() => {
    if (cards.length < 2) return;
    const timer = setTimeout(() => dispatch("advance"), promoInterval);
    return () => clearTimeout(timer);
  }, [cards, index]);

  return (
    <div className={`relative h-18 ${className}`}>
      <AnimatePresence initial={false}>
        {current ? (
          <motion.section
            key="stack"
            aria-label="Promotions"
            // The whole tile presses when its card does, not when the dismiss button does.
            className="absolute inset-0 overflow-hidden rounded-[22px] bg-secondary transition-[scale] duration-150 ease-out has-[[data-card]:active]:scale-[0.96]"
            {...layer}
          >
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
                <PromoCard promo={current} onOpenAccount={onOpenAccount}>
                  <motion.span variants={part}>{icons[current.id]}</motion.span>
                  <motion.span variants={part} className="flex min-w-0 flex-col">
                    <span className="text-body text-muted-foreground">{current.title[0]}</span>
                    <span className="flex items-center gap-2 text-label">
                      <span className="truncate">{current.title[1]}</span>
                      {current.demo && <DemoTag />}
                    </span>
                  </motion.span>
                </PromoCard>
              </motion.div>
            </AnimatePresence>

            <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1">
              {cards.length > 1 && (
                <div aria-hidden className="flex gap-1">
                  {cards.map((c, i) => (
                    <span
                      key={c.id}
                      className={`size-1 rounded-full transition-colors duration-300 ${i === index ? "bg-foreground" : "bg-faint"}`}
                    />
                  ))}
                </div>
              )}
              <button
                type="button"
                aria-label="Dismiss promotion"
                onClick={() => dispatch("dismiss")}
                className="pointer-events-auto grid size-11 place-items-center rounded-full text-muted-foreground outline-none transition-[color,scale] duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
              >
                <CloseIcon size={16} />
              </button>
            </div>
          </motion.section>
        ) : (
          <motion.button
            key="empty"
            type="button"
            onClick={() => dispatch("restore")}
            className="absolute inset-0 flex items-center gap-3 rounded-[22px] border border-dashed border-black/10 bg-white px-4 text-left text-body text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            whileTap={{ scale: 0.96 }}
            {...layer}
          >
            <RestoreIcon />
            Tap to bring back the promo cards
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function PromoCard({ promo, onOpenAccount, children }: { promo: Promo; onOpenAccount: (id: TileId) => void; children: ReactNode }) {
  const label = `${promo.title.join(" ")}${promo.demo ? ", demo" : ""}`;
  const className = "absolute inset-0 flex items-center gap-3 rounded-[22px] pr-20 pl-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";
  return "href" in promo ? (
    <Link data-card href={promo.href} transitionTypes={["push"]} aria-label={label} className={className}>
      {children}
    </Link>
  ) : (
    <button data-card type="button" aria-haspopup="dialog" aria-label={label} onClick={() => onOpenAccount(promo.account)} className={className}>
      {children}
    </button>
  );
}
