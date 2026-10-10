"use client";

import { CornersOutIcon } from "@phosphor-icons/react";
import { MotionConfig } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { swapSpring } from "./motion";

export function RecipientSheet({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <MotionConfig reducedMotion="user" transition={swapSpring}>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        onAnimationEnd={(isOpen) => {
          if (!isOpen) router.push("/home");
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
          {children}
        </DrawerContent>
      </Drawer>
    </MotionConfig>
  );
}
