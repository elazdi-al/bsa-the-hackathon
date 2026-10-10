"use client";

import { AnimatePresence, motion, type Variants } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RecipientSheet } from "@/app/choose-recipient/_components/recipient-sheet";
import { sendDraft } from "@/app/choose-recipient/data";
import { ClockIcon, GearIcon, HomeIcon, PlusIcon } from "@/components/icons";
import { transitionFor } from "@/components/navigation";
import { kinds } from "../history/_components/tx-row";
import { column } from "./column";
import { ReceiveSheet } from "./receive-sheet";
import { SwapSheet } from "./swap-sheet";
import { blurred, leave, sharp, snappy } from "./transitions";

// Each sheet is named for the transaction kind it makes, so its glyph is that kind's glyph in History.
type Sheet = "receive" | "send" | "swap";

const actions: { label: string; sheet: Sheet }[] = [
  { label: "Receive", sheet: "receive" },
  { label: "Send", sheet: "send" },
  { label: "Swap", sheet: "swap" },
];

const tabs = [
  { href: "/home", label: "Home", Icon: HomeIcon },
  { href: "/history", label: "History", Icon: ClockIcon },
  { href: "/settings", label: "Settings", Icon: GearIcon },
] as const;

const rowPitch = 68; // menu row height + gap; the last row sits exactly on the FAB

// Items rise out of the FAB, nearest first, and fold back into it in reverse.
const item: Variants = {
  closed: (i: number) => ({
    opacity: 0,
    filter: blurred,
    scale: 0.5,
    y: (actions.length - 1 - i) * rowPitch,
    transition: { ...leave, delay: i * 0.03 },
  }),
  open: (i: number) => ({
    opacity: 1,
    filter: sharp,
    scale: 1,
    y: 0,
    transition: { ...snappy, delay: (actions.length - 1 - i) * 0.04 },
  }),
};

const navIcon = "grid h-12 w-[54px] place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring";
const menuItem = "flex h-12 items-center gap-3.5 rounded-full pl-4 text-heading font-semibold outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]";

export function BottomBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const fab = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    fab.current?.focus();
  };

  // Back from the send review, the recipient sheet slides back up once the page has popped in: during the
  // view transition the page's snapshot paints over anything portalled, so it would land unseen.
  useEffect(() => {
    if (!sendDraft.get()) return;
    let live = true;
    const { activeViewTransition } = document as Document & { activeViewTransition?: ViewTransition | null };
    Promise.resolve(activeViewTransition?.finished).then(() => live && setSheet("send"));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      fab.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div data-tab-bar className="fixed inset-x-0 bottom-0 z-20 [--bar-pb:calc(max(env(safe-area-inset-bottom),8px)+8px)]">
      <nav aria-label="Main" style={{ viewTransitionName: "tab-bar" }} className="bg-linear-to-t from-white from-70% to-white/0 pt-6 pb-(--bar-pb)">
        <div className={`${column} flex items-center`}>
          {tabs.map(({ href, label, Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                transitionTypes={[transitionFor(pathname, href)]}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                className={`${navIcon} transition-[color,scale] duration-150 active:scale-[0.96] ${active ? "text-fuse-blue [--icon-duo:0.45]" : "text-faint [--icon-duo:0.5] hover:text-muted-foreground"}`}
              >
                <Icon size={24} />
              </Link>
            );
          })}

          <motion.button
            ref={fab}
            type="button"
            aria-label="Add"
            aria-expanded={open}
            aria-controls="quick-actions"
            onClick={() => setOpen(true)}
            className="ml-auto grid size-12 place-items-center rounded-full bg-black text-white outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            animate={open ? { scale: 0.5, opacity: 0, filter: blurred } : { scale: 1, opacity: 1, filter: sharp }}
            whileTap={{ scale: 0.96 }}
            transition={snappy}
          >
            <PlusIcon size={24} />
          </motion.button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            key="scrim"
            aria-hidden
            onClick={close}
            className="fixed inset-0 bg-white/90"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: snappy }}
            exit={{ opacity: 0, transition: { ...leave, delay: 0.05 } }}
          />
        )}
      </AnimatePresence>

      <div className={`${column} pointer-events-none absolute inset-x-0 bottom-(--bar-pb) flex justify-end`}>
        <AnimatePresence>
          {open && (
            <motion.ul
              key="menu"
              id="quick-actions"
              aria-label="Quick actions"
              className="pointer-events-auto flex flex-col items-end gap-5"
              initial="closed"
              animate="open"
              exit="closed"
            >
              {actions.map((action, i) => {
                const { Icon, text } = kinds[action.sheet];
                return (
                  <motion.li key={action.label} custom={i} variants={item} className="origin-right">
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        setSheet(action.sheet);
                      }}
                      className={menuItem}
                      autoFocus={i === 0}
                    >
                      {action.label}
                      <span className="grid size-12 place-items-center">
                        <Icon size={32} className={text} />
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      <ReceiveSheet open={sheet === "receive"} onOpenChange={(o) => !o && setSheet(null)} onClosed={() => fab.current?.focus()} />
      <RecipientSheet open={sheet === "send"} onOpenChange={(o) => !o && setSheet(null)} onClosed={() => fab.current?.focus()} />
      <SwapSheet open={sheet === "swap"} onOpenChange={(o) => !o && setSheet(null)} onClosed={() => fab.current?.focus()} />
    </div>
  );
}
