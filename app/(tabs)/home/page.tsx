import type { Metadata } from "next";
import { TabPage } from "../_components/tab-page";
import { Accounts } from "./_components/accounts";
import { BalanceChart } from "./_components/balance-chart";

export const metadata: Metadata = { title: "Wallet · Fuse" };

export default function Page() {
  return (
    <TabPage title="Wallet">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-12">
        <BalanceChart />
        <Accounts />
      </div>
    </TabPage>
  );
}
