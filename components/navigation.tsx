"use client";

import { ViewTransition, type ReactNode } from "react";

/**
 * How a navigation animates. Tabs sit side by side at depth 0 and drift in bar order; anything
 * else is pushed on top of where you came from and pops off on the way back.
 */
export type ScreenTransition = "tab-forward" | "tab-back" | "push" | "pop";

const tabs = ["/home", "/history", "/settings"];

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
