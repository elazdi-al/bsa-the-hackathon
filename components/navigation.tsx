"use client";

import { usePathname, useRouter } from "next/navigation";
import { ViewTransition, addTransitionType, startTransition, useEffect, useRef, type ReactNode } from "react";

/**
 * How a navigation animates. Tabs sit side by side at depth 0 and drift in bar order; anything
 * else is pushed on top of where you came from and pops off on the way back.
 */
export type ScreenTransition = "tab-forward" | "tab-back" | "push" | "pop";

const tabs = ["/home", "/apps", "/history", "/settings"];

export function transitionFor(from: string, to: string, back = false): ScreenTransition {
  const a = tabs.indexOf(from);
  const b = tabs.indexOf(to);
  if (a >= 0 && b >= 0) return b < a ? "tab-back" : "tab-forward";
  return back ? "pop" : "push";
}

const byType = { "tab-forward": "tab-forward", "tab-back": "tab-back", push: "push", pop: "pop", default: "none" };

/**
 * Root of every full screen: the tabs and pushed screens. It animates only for navigations that carry
 * a ScreenTransition type (CSS in globals.css). Sheet routes skip it, since vaul animates them.
 */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={byType} exit={byType} default="none">
      {children}
    </ViewTransition>
  );
}

type HistoryNavigation = EventTarget & { canGoBack: boolean; currentEntry: { index: number } | null };
type TraverseEvent = Event & { navigationType: string; destination: { index: number } };

const navigation = () => (window as Window & { navigation?: HistoryNavigation }).navigation;

// Without the Navigation API, any client-side route change means Back stays inside the app.
let navigated = false;

/**
 * Mounted once in the root layout. Tags history traversals (router.back() and the browser's own
 * Back and Forward) with a transition type, so going back pops instead of swapping.
 */
export function HistoryTransitions() {
  const pathname = usePathname();
  const shown = useRef(pathname);

  useEffect(() => {
    if (pathname !== shown.current) navigated = true;
    shown.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const nav = navigation();
    let back = true;
    const onNavigate = (e: Event) => {
      const { navigationType, destination } = e as TraverseEvent;
      if (navigationType === "traverse") back = destination.index < (nav?.currentEntry?.index ?? 0);
    };
    // Next restores the route in its own popstate transition. Holding an async transition open across
    // it entangles the two, so Next's commit carries our type. Capture runs this before Next's listener.
    const onPopState = () => {
      const type = transitionFor(shown.current, location.pathname, back);
      back = true;
      startTransition(async () => {
        addTransitionType(type);
        await new Promise((resolve) => setTimeout(resolve));
      });
    };
    nav?.addEventListener("navigate", onNavigate);
    window.addEventListener("popstate", onPopState, { capture: true });
    return () => {
      nav?.removeEventListener("navigate", onNavigate);
      window.removeEventListener("popstate", onPopState, { capture: true });
    };
  }, []);

  return null;
}

/** Leaves the current screen: back through history when the previous entry is in the app, else to `fallback`. */
export function useBack(fallback: string) {
  const router = useRouter();
  return () => {
    if (navigation()?.canGoBack ?? navigated) router.back();
    else router.replace(fallback, { transitionTypes: ["pop"] });
  };
}
