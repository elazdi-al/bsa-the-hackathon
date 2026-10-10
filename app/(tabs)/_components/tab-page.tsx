import { ViewTransition, type ReactNode } from "react";
import { column } from "./column";

/**
 * Shell for a tab screen. Tab-bar navigations carry the `tab` transition type, which cross-fades
 * the page through a light blur; every other navigation swaps instantly. The bar lives in the layout.
 */
export function TabPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ViewTransition enter={{ tab: "tab", default: "none" }} exit={{ tab: "tab", default: "none" }} default="none">
      <main className="relative min-h-dvh w-full overflow-hidden bg-white">
        <div className={`${column} pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+112px)] md:pt-[calc(env(safe-area-inset-top)+40px)]`}>
          <h1 className="text-[17px] leading-[22px] font-semibold">{title}</h1>
          {children}
        </div>
      </main>
    </ViewTransition>
  );
}
