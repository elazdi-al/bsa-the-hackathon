"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { TrendUpIcon } from "@/components/icons";
import { BackButton } from "@/components/ui/back-button";
import { buttonVariants } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { rowPress, sectionLabel } from "../../_components/list";
import { blurred, leave, reveal, sharp } from "../../_components/transitions";
import { dapps, type DApp } from "../data";

// 10px around a 12px-radius icon makes the row's pressed tint concentric with it at 22px, the tiles' radius.
const row = "flex w-full items-center gap-4 rounded-[22px] p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";
const disc = cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative size-10 bg-secondary text-muted-foreground after:absolute after:-inset-0.5 hover:bg-black/[0.07]");

function AppIcon({ app, className }: { app: DApp; className: string }) {
  return <img src={app.icon.src} alt="" className={cn("shrink-0 outline -outline-offset-1 outline-black/10", className)} />;
}

export function AppsView() {
  const [open, setOpen] = useState(false);
  // Kept after close so the sheet's content doesn't vanish mid-exit.
  const [app, setApp] = useState(dapps[0]);

  return (
    <>
      <section aria-labelledby="featured" className="mt-6">
        <h2 id="featured" className={sectionLabel}>
          Featured
        </h2>
        <ul className="-mx-2.5 grid grid-cols-1 md:grid-cols-2 md:gap-x-6">
          {dapps.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => {
                  setApp(d);
                  setOpen(true);
                }}
                className={`${row} ${rowPress}`}
              >
                <AppIcon app={d} className="size-12 rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label">{d.name}</span>
                  <span className="block truncate text-body text-muted-foreground">{d.about}</span>
                </span>
                <span aria-hidden className="shrink-0 rounded-full bg-secondary px-4 py-1.5 text-body font-semibold text-brand">
                  Open
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <p className="mt-8 text-center text-caption text-balance text-faint">These apps are run by others, not Swissquote.</p>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent aria-describedby={undefined} className="h-[calc(100dvh-env(safe-area-inset-top)-12px)] overflow-hidden sm:h-[calc(100dvh-2rem)]">
          <header className="flex shrink-0 items-center gap-3 px-4 pt-2 pb-3">
            <AppIcon app={app} className="size-9 rounded-[10px]" />
            <div className="min-w-0 flex-1">
              <DrawerTitle className="truncate text-label">{app.name}</DrawerTitle>
              <p className="truncate text-caption text-muted-foreground">{new URL(app.url).host}</p>
            </div>
            <a href={app.url} target="_blank" rel="noreferrer" aria-label={`Open ${app.name} in your browser`} className={disc}>
              <TrendUpIcon size={20} />
            </a>
            <DrawerClose asChild>
              <BackButton kind="close" />
            </DrawerClose>
          </header>
          <AppFrame key={app.id} app={app} />
        </DrawerContent>
      </Drawer>
    </>
  );
}

/** The dApp itself, behind its icon until its first page loads. */
function AppFrame({ app }: { app: DApp }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col border-t border-black/[0.06] pb-[env(safe-area-inset-bottom)]">
      <motion.div
        aria-hidden
        className="absolute inset-0 grid place-items-center"
        initial={{ opacity: 0, scale: 0.9, filter: blurred }}
        animate={loaded ? { opacity: 0 } : { opacity: 1, scale: 1, filter: sharp }}
        transition={loaded ? leave : { ...reveal, delay: 0.15 }}
      >
        <AppIcon app={app} className="size-16 rounded-[18px]" />
      </motion.div>
      <iframe
        src={app.url}
        title={app.name}
        onLoad={() => setLoaded(true)}
        // Its own origin keeps the dApp out of this wallet's storage. With no allow-top-navigation it can't swap the wallet's page for its own.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
        allow="clipboard-write"
        className={cn("relative min-h-0 w-full flex-1 transition-opacity duration-200 ease-out", !loaded && "opacity-0")}
      />
    </div>
  );
}
