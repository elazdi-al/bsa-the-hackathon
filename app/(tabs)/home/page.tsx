import { TabPage } from "../_components/tab-page";
import { AssetTile } from "./_components/asset-tile";
import { BalanceChart } from "./_components/balance-chart";
import { PromoStack } from "./_components/promo-stack";
import { tiles } from "./data";

export default function Page() {
  return (
    <TabPage title="Wallet">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-12">
        <BalanceChart />
        <section aria-label="Accounts" className="mt-3.5 grid auto-rows-[152px] grid-cols-2 gap-2.5 md:grid-cols-4 lg:mt-6 lg:grid-cols-2">
          {tiles.map((tile, i) => (
            <AssetTile key={tile.id} tile={tile} index={i} />
          ))}
          <PromoStack className="col-span-2 md:col-span-4 lg:col-span-2" />
        </section>
      </div>
    </TabPage>
  );
}
