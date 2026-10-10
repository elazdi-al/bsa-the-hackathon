"use client";

import { CornersOutIcon } from "@phosphor-icons/react";
import { AnimatePresence, MotionConfig, motion, useDragControls } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { sheetSpring, swapSpring } from "./motion";

export function RecipientSheet({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dragControls = useDragControls();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <MotionConfig reducedMotion="user" transition={swapSpring}>
      <AnimatePresence onExitComplete={() => router.push("/home")}>
        {open && (
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-title"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={sheetSpring}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 1 }}
            dragTransition={{ bounceStiffness: 500, bounceDamping: 45 }}
            onDragEnd={(_, { offset, velocity }) => {
              if (offset.y > 100 || velocity.y > 500) setOpen(false);
            }}
            className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] bottom-0 rounded-t-[35px] bg-white pb-[env(safe-area-inset-bottom)] tracking-[-0.05em]"
          >
            <header
              onPointerDown={(event) => dragControls.start(event)}
              className="relative mt-4 flex h-11 touch-none items-center justify-center"
            >
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="absolute -top-4 left-1/2 grid h-6 w-16 -translate-x-1/2 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-fuse-blue"
              >
                <span className="h-[5px] w-9 rounded-full bg-black/10" />
              </button>
              <h1 id="sheet-title" className="text-[18px] font-semibold tracking-[-0.03em]">
                Choose recipient
              </h1>
              <button
                type="button"
                aria-label="Scan QR code"
                className="absolute right-4 grid size-11 place-items-center rounded-full transition-transform duration-150 ease-out focus-visible:outline-2 focus-visible:outline-fuse-blue active:scale-[0.96]"
              >
                <CornersOutIcon size={31} />
              </button>
            </header>
            {children}
          </motion.section>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
