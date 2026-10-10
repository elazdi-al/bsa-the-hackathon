"use client";

import { CornersOutIcon } from "@phosphor-icons/react";
import { MotionConfig } from "motion/react";
import { useState } from "react";
import { useBack } from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
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
            <Button variant="ghost" size="icon" aria-label="Scan QR code" className="absolute right-4">
              <CornersOutIcon size={31} />
            </Button>
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
