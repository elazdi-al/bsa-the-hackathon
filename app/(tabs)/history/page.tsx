import type { Metadata } from "next";
import { Suspense } from "react";
import { TabPage } from "../_components/tab-page";
import { HistoryList } from "./_components/history-list";

export const metadata: Metadata = { title: "History · Fuse" };

export default function Page() {
  return (
    <TabPage title="History">
      <Suspense>
        <HistoryList />
      </Suspense>
    </TabPage>
  );
}
