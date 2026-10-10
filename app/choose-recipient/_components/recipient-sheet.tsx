"use client";

import { MotionConfig } from "motion/react";
import { useState } from "react";
import { snappy } from "@/app/(tabs)/_components/transitions";
import { useBack } from "@/components/navigation";
import { Drawer, DrawerContent, DrawerHeader } from "@/components/ui/drawer";
import { sendDraft } from "../data";
import { AddressCard } from "./address-card";
import { RecentAddresses } from "./recent-addresses";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After the user dismisses the sheet, once it has slid away. Not called when Continue navigates on. */
  onClosed: () => void;
};

export function RecipientSheet({ open, onOpenChange, onClosed }: Props) {
  return (
    <MotionConfig reducedMotion="user" transition={snappy}>
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
        {/* Continue pushes the review with the sheet still up. Named, the sheet and its dim dissolve on top;
            left in the root snapshot, the outgoing page's own snapshot would paint over them. */}
        <DrawerContent
          aria-describedby={undefined}
          overlayClassName="[view-transition-name:recipient-overlay]"
          className="h-[calc(100dvh-env(safe-area-inset-top)-12px)] pb-[env(safe-area-inset-bottom)] tracking-[-0.02em] [view-transition-name:recipient-sheet] sm:h-auto sm:pb-5"
        >
          <DrawerHeader title="Choose recipient" />
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
