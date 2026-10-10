import type { Metadata } from "next";
import { TabPage } from "../_components/tab-page";
import { tiles } from "../home/data";
import { HistoryList } from "./_components/history-list";
import { justSent } from "./data";

export const metadata: Metadata = { title: "History · Fuse" };

const one = (param?: string | string[]) => (typeof param === "string" ? param : undefined);

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ account?: string | string[]; sent?: string | string[]; amount?: string | string[] }>;
}) {
  const { account, sent, amount } = await searchParams;

  return (
    <TabPage title="History">
      <HistoryList account={tiles.find((t) => t.id === account)?.id} sent={justSent(one(sent), one(amount))} />
    </TabPage>
  );
}
