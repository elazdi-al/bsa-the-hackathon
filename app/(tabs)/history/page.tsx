import type { Metadata } from "next";
import { TabPage } from "../_components/tab-page";

export const metadata: Metadata = { title: "History · Fuse" };

export default function Page() {
  return <TabPage title="History">{null}</TabPage>;
}
