"use client";

import { CaretRightIcon, SignOutIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { FusePlusIcon } from "@/app/(tabs)/home/_components/icons";
import { shortAddress } from "@/app/choose-recipient/data";
import { CopyButton } from "@/app/transaction-tracking/_components/copy-button";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger, FloatingSheetContent, FloatingSheetHeader } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { Glyph } from "../../_components/glyph";
import { hairline, rowPress, sectionLabel } from "../../_components/list";
import { plus, profile, sections, version, type Row, type Status, type TrayRow } from "../data";

// Rows sit 6px inside a 22px card, so their press tint is rounded 16px to stay concentric.
const card = `rounded-[22px] ${hairline}`;
const row = "flex min-h-[60px] w-full items-center gap-3 rounded-[16px] px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

const statuses: Record<Status, ReactNode> = {
  Active: (
    <span className="flex items-center gap-1.5 text-[15px] text-[#adadad]">
      <span aria-hidden className="size-1.5 rounded-full bg-positive" />
      Active
    </span>
  ),
  Pending: <span className="rounded-full bg-pending/12 px-2 py-0.5 text-[13px] leading-4 font-medium text-pending">Pending</span>,
};

const Chevron = () => <CaretRightIcon weight="bold" size={14} aria-hidden className="shrink-0 text-black/20" />;

function SettingsRow({ item, onOpen }: { item: Row; onOpen: (item: TrayRow) => void }) {
  const body = (
    <>
      <Glyph Icon={item.Icon} color={item.color} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-5 font-medium">{item.label}</span>
        {item.detail && <span className="mt-0.5 block truncate text-[13px] leading-[18px] text-[#adadad]">{item.detail}</span>}
      </span>
      {item.status && <span className="shrink-0">{statuses[item.status]}</span>}
      {item.kind === "info" && item.value && <span className="shrink-0 text-[15px] text-[#adadad]">{item.value}</span>}
      {item.kind !== "info" && item.kind !== "switch" && <Chevron />}
    </>
  );

  switch (item.kind) {
    case "info":
      return <div className={row}>{body}</div>;
    case "tray":
      return (
        <button type="button" aria-haspopup="dialog" onClick={() => onOpen(item)} className={`${row} ${rowPress}`}>
          {body}
        </button>
      );
    case "push":
      return (
        <Link href={item.href} transitionTypes={["push"]} className={`${row} ${rowPress}`}>
          {body}
        </Link>
      );
    case "mail":
      return (
        <a href={item.href} className={`${row} ${rowPress}`}>
          {body}
        </a>
      );
    case "switch":
      return (
        <label className={`${row} ${rowPress} cursor-pointer`}>
          {body}
          <Switch defaultChecked={item.on} aria-label={item.label} />
        </label>
      );
  }
}

function SignOut() {
  const router = useRouter();
  return (
    <Drawer>
      <div className={`${card} mt-6 p-1.5`}>
        <DrawerTrigger asChild>
          <button type="button" className={`${row} ${rowPress}`}>
            <Glyph Icon={SignOutIcon} color="var(--color-negative)" />
            <span className="text-[15px] leading-5 font-medium text-negative">Sign out</span>
          </button>
        </DrawerTrigger>
      </div>
      <DrawerContent>
        <div className="px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="px-3">
            <Glyph Icon={SignOutIcon} color="var(--color-negative)" size={54} />
            <DrawerTitle className="mt-4 text-[20px]">Sign out of Fuse?</DrawerTitle>
            <DrawerDescription className="mt-1">Your keys stay safe while you’re away. Sign back in with Apple any time.</DrawerDescription>
          </div>
          <Button onClick={() => router.replace("/onboarding-welcome", { transitionTypes: ["pop"] })} className="mt-7 w-full bg-negative hover:bg-negative/85">
            Sign out
          </Button>
          <DrawerClose asChild>
            <Button variant="secondary" className="mt-2 w-full">
              Cancel
            </Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function SettingsView() {
  const [open, setOpen] = useState(false);
  // Kept after close so the tray's content doesn't vanish mid-exit.
  const [tray, setTray] = useState<TrayRow>();

  return (
    <div className="mt-6 max-w-xl lg:grid lg:max-w-none lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-12">
      <div>
        <div className="flex items-center gap-4 px-1">
          <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-black text-[21px] font-semibold text-white">
            {profile.initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[22px] leading-7 font-bold tracking-[-0.02em]">{profile.name}</p>
            <CopyButton text={profile.address} label={`Copy address ${profile.address}`}>
              <span className="text-[15px] leading-5 text-[#adadad]">{shortAddress(profile.address)}</span>
            </CopyButton>
          </div>
        </div>

        <Link
          href="/fuse-plus"
          transitionTypes={["push"]}
          className={`${card} mt-6 flex items-center gap-3 p-4 outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]`}
        >
          <span className="grid size-10 shrink-0 place-items-center">
            <FusePlusIcon />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[15px] leading-5 font-medium">
              {plus.title}
              <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[12px] leading-4 font-medium text-black/60">{plus.status}</span>
            </span>
            <span className="mt-0.5 block text-[13px] leading-[18px] text-pretty text-[#adadad]">{plus.benefits}</span>
          </span>
          <Chevron />
        </Link>
      </div>

      <div>
        {sections.map((section) => (
          <section key={section.title} className="mt-6 lg:first:mt-0">
            <h2 className={`px-4 ${sectionLabel}`}>{section.title}</h2>
            <div className={`${card} p-1.5`}>
              {section.rows.map((item) => (
                <SettingsRow
                  key={item.label}
                  item={item}
                  onOpen={(next) => {
                    setTray(next);
                    setOpen(true);
                  }}
                />
              ))}
            </div>
          </section>
        ))}

        <SignOut />
        <p className="mt-6 text-center text-[13px] text-[#c8c8c8]">{version}</p>
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <FloatingSheetContent>
          {tray && (
            <div className="px-4 pb-6">
              <FloatingSheetHeader icon={<Glyph Icon={tray.Icon} color={tray.color} size={54} />} title={tray.label}>
                <p className="mt-1 text-[20px] leading-7 font-semibold tracking-[-0.01em]">{tray.detail}</p>
                <p className="mt-2 max-w-[300px] font-medium text-pretty text-[#969696]">{tray.about}</p>
              </FloatingSheetHeader>
            </div>
          )}
        </FloatingSheetContent>
      </Drawer>
    </div>
  );
}
