"use client";

import { ImagesSquareIcon, SquaresFourIcon, type Icon } from "@phosphor-icons/react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useState } from "react";
import { coins, type CoinId } from "../data";
import { CoinRow } from "./coin-row";
import { Recede, blurredOut, quickOut, sharp, spring } from "./motion";
import { WalletHeader } from "./wallet-header";

const tabs = ["Dashboard", "Coins", "NFTs"] as const;
type Tab = (typeof tabs)[number];

const empty: Record<Exclude<Tab, "Coins">, { icon: Icon; title: string; body: string }> = {
  Dashboard: { icon: SquaresFourIcon, title: "Your dashboard is on its way", body: "Portfolio insights will live here." },
  NFTs: { icon: ImagesSquareIcon, title: "No NFTs yet", body: "Collectibles you receive will show up here." },
};

export function CoinsScreen() {
  const [tab, setTab] = useState<Tab>("Coins");
  const [focused, setFocused] = useState<CoinId | null>(null);

  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFocused(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused]);

  return (
    <MotionConfig reducedMotion="user">
      {/* Receded content is inert, so a tap anywhere outside the breakdown lands here and closes it. */}
      <div
        className="min-h-dvh pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+180px)]"
        onClick={focused ? () => setFocused(null) : undefined}
      >
        <Recede active={focused !== null}>
          <WalletHeader />
          <div role="tablist" aria-label="Wallet sections" className="mt-[19px] flex gap-[25px] px-[22px]">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`tab-${t}`}
                aria-selected={t === tab}
                aria-controls="wallet-panel"
                onClick={() => setTab(t)}
                className={`relative pb-1 text-[18px]/6 font-medium tracking-[-0.01em] transition-colors duration-200 before:absolute before:-inset-x-2 before:-inset-y-2.5 ${
                  t === tab ? "text-black" : "text-[#9a9a9a]"
                }`}
              >
                {t}
                {t === tab && (
                  <motion.span
                    layoutId="tab-underline"
                    transition={spring}
                    className="absolute inset-x-0 bottom-0 mx-auto h-[2.5px] w-[19px] rounded-full bg-[#111]"
                  />
                )}
              </button>
            ))}
          </div>
        </Recede>

        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={tab}
            id="wallet-panel"
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
            initial={blurredOut}
            animate={sharp}
            exit={{ ...blurredOut, transition: quickOut }}
            transition={spring}
            className="pt-[28px]"
          >
            {tab === "Coins" ? (
              <ul>
                {coins.map((coin) => (
                  <CoinRow
                    key={coin.id}
                    coin={coin}
                    state={focused === null ? "idle" : focused === coin.id ? "open" : "receded"}
                    onToggle={() => setFocused(focused === coin.id ? null : coin.id)}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState {...empty[tab]} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: Icon; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center px-10 pt-24 text-center">
      <Icon weight="duotone" aria-hidden className="size-9 text-[#b2b2b2]" />
      <p className="mt-4 text-[17px] font-semibold text-balance">{title}</p>
      <p className="mt-1 text-[15px] text-pretty text-[#8a8a8a]">{body}</p>
    </div>
  );
}
