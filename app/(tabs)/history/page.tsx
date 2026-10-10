import type { Metadata } from "next";
import { TabPage } from "../_components/tab-page";
import { tiles } from "../home/data";
import { HistoryList } from "./_components/history-list";

export const metadata: Metadata = { title: "History" };

export default async function Page({ searchParams }: { searchParams: Promise<{ account?: string | string[] }> }) {
  const { account } = await searchParams;

  return (
    <TabPage title="History">
      <HistoryList account={tiles.find((t) => t.id === account)?.id} />
    </TabPage>
  );
}
