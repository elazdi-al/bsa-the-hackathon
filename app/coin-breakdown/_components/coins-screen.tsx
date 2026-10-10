"use client";

import { ImagesSquareIcon, SquaresFourIcon, type Icon } from "@phosphor-icons/react";
import { MotionConfig } from "motion/react";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { coins, type CoinId } from "../data";
import { CoinRow } from "./coin-row";
import { Recede } from "./motion";
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
        <Tabs value={tab} onValueChange={setTab} className="mx-auto w-full max-w-2xl gap-0">
          <Recede active={focused !== null}>
            <WalletHeader />
            <TabsList
              variant="line"
              aria-label="Wallet sections"
              className="relative mt-[19px] flex w-full justify-start gap-[25px] p-0 px-[22px] group-data-horizontal/tabs:h-auto"
            >
              {tabs.map((t) => (
                <TabsTrigger
                  key={t}
                  value={t}
                  className="h-auto flex-none border-0 px-0 pt-0 pb-1 text-[18px]/6 font-medium tracking-[-0.01em] text-[#9a9a9a] transition-colors duration-200 before:absolute before:-inset-x-2 before:-inset-y-2.5 after:hidden hover:text-[#9a9a9a] focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-4 aria-selected:text-black"
                >
                  {t}
                </TabsTrigger>
              ))}
              <TabsIndicator className="bottom-0 left-[calc(var(--active-tab-left)_+_var(--active-tab-width)/2_-_9.5px)] h-[2.5px] w-[19px] rounded-full bg-[#111]" />
            </TabsList>
          </Recede>

          <div className="relative">
            {tabs.map((t) => (
              <TabsContent
                key={t}
                value={t}
                className="pt-[28px] text-base transition-[opacity,filter] duration-350 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none data-ending-style:absolute data-ending-style:inset-x-0 data-ending-style:top-0 data-ending-style:opacity-0 data-ending-style:blur-[4px] data-ending-style:duration-150 data-starting-style:opacity-0 data-starting-style:blur-[4px]"
              >
                {t === "Coins" ? (
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
                  <EmptyState {...empty[t]} />
                )}
              </TabsContent>
            ))}
          </div>
        </Tabs>
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
