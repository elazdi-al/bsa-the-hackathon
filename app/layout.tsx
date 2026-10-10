import type { Metadata, Viewport } from "next";
import { HistoryTransitions } from "@/components/navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: { template: "%s · Swissquote Wallet", default: "Swissquote Wallet" },
  description: "A self-custody wallet: your keys, Swissquote's checks and recovery.",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">
        {children}
        <HistoryTransitions />
      </body>
    </html>
  );
}
