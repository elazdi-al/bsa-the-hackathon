import { MotionConfig } from "motion/react";
import { AssetTile } from "./_components/asset-tile";
import { BalanceChart } from "./_components/balance-chart";
import { BottomBar } from "./_components/bottom-bar";
import { PromoStack } from "./_components/promo-stack";
import { tiles } from "./data";

export default function Page() {
  return (
    <MotionConfig reducedMotion="user">
      <main className="relative mx-auto min-h-dvh w-full max-w-[430px] overflow-hidden bg-white">
        <div className="px-6 pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+112px)]">
          <h1 className="text-[17px] leading-[22px] font-semibold">Wallet</h1>
          <BalanceChart />
          <section aria-label="Accounts" className="mt-3.5 grid auto-rows-[152px] grid-cols-2 gap-2.5">
            {tiles.map((tile, i) => (
              <AssetTile key={tile.id} tile={tile} index={i} />
            ))}
            <PromoStack className="col-span-2" />
          </section>
        </div>
        <BottomBar />
      </main>
    </MotionConfig>
  );
}
