import type { Metadata } from "next";
import { TabPage } from "../_components/tab-page";

export const metadata: Metadata = { title: "Settings · Fuse" };

export default function Page() {
  return <TabPage title="Settings">{null}</TabPage>;
}
