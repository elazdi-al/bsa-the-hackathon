import type { Metadata } from "next";
import { Screen } from "@/components/navigation";
import { DappsScreen } from "./_components/dapps-screen";

export const metadata: Metadata = { title: "Reviewed dApps" };
export default function Page() {
  return <Screen><DappsScreen /></Screen>;
}
