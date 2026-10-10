import type { Metadata } from "next";
import { TabPage } from "../_components/tab-page";
import { SettingsView } from "./_components/settings-view";

export const metadata: Metadata = { title: "Settings · Fuse" };

export default function Page() {
  return (
    <TabPage title="Settings">
      <SettingsView />
    </TabPage>
  );
}
