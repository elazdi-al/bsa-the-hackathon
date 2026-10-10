import { MotionConfig } from "motion/react";
import { AssetTile } from "./_components/asset-tile";
import { BalanceChart } from "./_components/balance-chart";
import { BottomBar } from "./_components/bottom-bar";
import { column } from "./_components/column";
import { PromoStack } from "./_components/promo-stack";
import { tiles } from "./data";

export default function Page() {
  return (
    <MotionConfig reducedMotion="user">
      <main className="relative min-h-dvh w-full overflow-hidden bg-white">
        <div className={`${column} pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+112px)] md:pt-[calc(env(safe-area-inset-top)+40px)]`}>
          <h1 className="text-[17px] leading-[22px] font-semibold">Wallet</h1>
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-12">
            <BalanceChart />
            <section aria-label="Accounts" className="mt-3.5 grid auto-rows-[152px] grid-cols-2 gap-2.5 md:grid-cols-4 lg:mt-6 lg:grid-cols-2">
              {tiles.map((tile, i) => (
                <AssetTile key={tile.id} tile={tile} index={i} />
              ))}
              <PromoStack className="col-span-2 md:col-span-4 lg:col-span-2" />
            </section>
          </div>
        </div>
        <BottomBar />
      </main>
    </MotionConfig>
  );
}
