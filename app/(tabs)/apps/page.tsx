import type { Metadata } from "next";
import { TabPage } from "../_components/tab-page";
import { AppsView } from "./_components/apps-view";

export const metadata: Metadata = { title: "Apps" };

export default function Page() {
  return (
    <TabPage title="Apps">
      <AppsView />
    </TabPage>
  );
}
