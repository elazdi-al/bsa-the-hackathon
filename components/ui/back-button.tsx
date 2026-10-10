"use client";

import { Button } from "@base-ui/react/button";
import { CaretLeftIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import Link from "next/link";
import type { ComponentProps } from "react";
import { useBack } from "@/components/navigation";
import { buttonVariants } from "./button";

const tones = {
  light: "bg-black/[0.04] text-black/50 hover:bg-black/[0.07]",
  dark: "bg-white/10 text-white/70 hover:bg-white/15 focus-visible:outline-white/60",
};

type BackButtonProps = { kind?: "back" | "close"; tone?: keyof typeof tones; className?: string } & (
  | { fallback: string }
  | ({ fallback?: undefined } & ComponentProps<"button">)
);

/**
 * The one back/close control: a 40px disc with a 44px hit area. With `fallback` it leaves the screen
 * itself, as a link (see useBack); without, it's a plain button for a parent to wire, e.g. DrawerClose.
 */
export function BackButton({ kind = "back", tone = "light", className, fallback, ...props }: BackButtonProps) {
  const Icon = kind === "back" ? CaretLeftIcon : XIcon;
  const look = {
    "aria-label": kind === "back" ? "Back" : "Close",
    className: cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative size-10 after:absolute after:-inset-0.5", tones[tone], className),
    children: <Icon weight="bold" size={18} aria-hidden />,
  };

  return fallback ? <BackLink fallback={fallback} {...look} /> : <Button {...look} {...props} />;
}

function BackLink({ fallback, ...props }: { fallback: string } & ComponentProps<"a">) {
  const back = useBack(fallback);
  return (
    <Link
      href={fallback}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        back();
      }}
      {...props}
    />
  );
}
