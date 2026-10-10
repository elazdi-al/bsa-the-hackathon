"use client";

import { MotionConfig } from "motion/react";
import { useState } from "react";
import { useBack } from "@/components/navigation";
import { BackButton } from "@/components/ui/back-button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { sendDraft } from "../data";
import { AddressCard } from "./address-card";
import { swapSpring } from "./motion";
import { RecentAddresses } from "./recent-addresses";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After the user dismisses the sheet, once it has slid away. Not called when Continue navigates on. */
  onClosed: () => void;
};

export function RecipientSheet({ open, onOpenChange, onClosed }: Props) {
  return (
    <MotionConfig reducedMotion="user" transition={swapSpring}>
      <Drawer
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) sendDraft.clear();
          onOpenChange(isOpen);
        }}
        onAnimationEnd={(isOpen) => {
          if (!isOpen) onClosed();
        }}
      >
        <DrawerContent
          aria-describedby={undefined}
          className="h-[calc(100dvh-env(safe-area-inset-top)-12px)] pb-[env(safe-area-inset-bottom)] tracking-[-0.05em] sm:h-auto sm:pb-5"
        >
          <header className="relative flex h-11 shrink-0 items-center justify-center">
            <DrawerTitle className="tracking-[-0.03em]">Choose recipient</DrawerTitle>
            <DrawerClose asChild>
              <BackButton kind="close" className="absolute right-4" />
            </DrawerClose>
          </header>
          <AddressCard />
          <RecentAddresses />
        </DrawerContent>
      </Drawer>
    </MotionConfig>
  );
}

/** The sheet as its own route, for direct visits: open on arrival, leaving the route once dismissed. */
export function RecipientSheetRoute() {
  const [open, setOpen] = useState(true);
  return <RecipientSheet open={open} onOpenChange={setOpen} onClosed={useBack("/home")} />;
}
