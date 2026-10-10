import type { ReactNode } from "react";
import { Screen } from "@/components/navigation";
import { column } from "./column";

/**
 * Shell for a tab screen. The bar lives in the layout, so only the page moves on a tab switch.
 * `hideTitle` keeps the heading for assistive tech on a screen whose hero says it already (Home's balance).
 */
export function TabPage({ title, hideTitle = false, children }: { title: string; hideTitle?: boolean; children: ReactNode }) {
  return (
    <Screen>
      <main className="relative min-h-dvh w-full overflow-hidden bg-white">
        <div className={`${column} pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+112px)] md:pt-[calc(env(safe-area-inset-top)+40px)]`}>
          <h1 className={hideTitle ? "sr-only" : "text-title"}>{title}</h1>
          {children}
        </div>
      </main>
    </Screen>
  );
}
