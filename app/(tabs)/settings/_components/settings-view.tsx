"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FusePlusIcon } from "@/app/(tabs)/home/_components/icons";
import { shortAddress } from "@/app/choose-recipient/data";
import { CopyButton } from "@/app/transaction-tracking/_components/copy-button";
import { ChevronRightIcon, ShieldIcon, SignOutIcon, type Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tray, TrayActions, TrayHeader } from "@/components/ui/tray";
import { rowPress, sectionLabel } from "../../_components/list";
import { keys, plus, profile, sections, version, type KeyId, type Row, type Status, type TrayRoot } from "../data";

type View = { name: TrayRoot } | { name: "key"; id: KeyId };

const viewKey = (view: View) => (view.name === "key" ? `key-${view.id}` : view.name);

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-ring";
// Inside each section's -mx-3, the 12px padding lets the pressed tint bleed past the column while glyphs align with the profile.
const row = `flex min-h-14 w-full items-center gap-4 rounded-2xl px-3 py-2 text-left ${focusRing} focus-visible:ring-inset`;
const dot: Record<Status, string> = { Active: "bg-positive", "All active": "bg-positive", Pending: "bg-pending" };

function StatusMark({ status }: { status: Status }) {
  return (
    <span className="flex shrink-0 items-center gap-2 text-label font-medium text-muted-foreground">
      <span aria-hidden className={`size-2 rounded-full ${dot[status]}`} />
      {status}
    </span>
  );
}

const Chevron = () => <ChevronRightIcon size={16} className="shrink-0 text-faint" />;

function SettingsRow({ item, onOpen }: { item: Row; onOpen: (root: TrayRoot) => void }) {
  const body = (
    <>
      <item.Icon className={`shrink-0 ${item.destructive ? "text-negative" : "text-muted-foreground"}`} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-label ${item.destructive ? "text-negative" : ""}`}>{item.label}</span>
        {item.detail && <span className="block truncate text-body text-muted-foreground">{item.detail}</span>}
      </span>
      {item.status && <StatusMark status={item.status} />}
      {item.kind === "info" && <span className="shrink-0 text-label font-medium text-muted-foreground">{item.value}</span>}
      {item.kind !== "info" && item.kind !== "switch" && <Chevron />}
    </>
  );

  switch (item.kind) {
    case "info":
      return <div className={row}>{body}</div>;
    case "tray":
      return (
        <button type="button" aria-haspopup="dialog" onClick={() => onOpen(item.opens)} className={`${row} ${rowPress}`}>
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

function PlusCard() {
  return (
    <Link
      href="/fuse-plus"
      transitionTypes={["push"]}
      className={`mt-6 flex items-center gap-4 rounded-[24px] bg-ink p-5 text-white transition-transform duration-150 ease-out active:scale-[0.96] ${focusRing} focus-visible:ring-offset-2`}
    >
      <FusePlusIcon />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-label">{plus.title}</span>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-caption font-semibold">{plus.status}</span>
        </span>
        <span className="mt-0.5 block text-body text-pretty text-white/60">{plus.benefits}</span>
      </span>
      <ChevronRightIcon size={16} className="shrink-0 text-white/40" />
    </Link>
  );
}

function Hero({ Icon, color }: { Icon: Icon; color: string }) {
  return (
    <span aria-hidden style={{ color }} className="grid size-14 place-items-center rounded-full bg-current/12">
      <Icon size={32} />
    </span>
  );
}

function TrayBody({ view, push, close }: { view: View; push: (next: View) => void; close: () => void }) {
  const router = useRouter();
  switch (view.name) {
    case "keys":
      return (
        <>
          <TrayHeader
            icon={<Hero Icon={ShieldIcon} color="var(--color-fuse-blue)" />}
            title="Your keys"
            description="Any two of your three keys approve a payment, so losing one never locks you out."
          />
          <div className="mt-6 space-y-2">
            {keys.map(({ id, title, detail, Icon, accent }) => (
              <button
                key={id}
                type="button"
                onClick={() => push({ name: "key", id })}
                className={`flex h-[60px] w-full items-center gap-4 rounded-2xl bg-secondary px-4 text-left transition-[scale,background-color] duration-150 ease-out hover:bg-black/[0.07] active:scale-[0.96] ${focusRing}`}
              >
                <Icon className="shrink-0" style={{ color: accent }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label">{title}</span>
                  <span className="block truncate text-body text-muted-foreground">{detail}</span>
                </span>
                <StatusMark status="Active" />
              </button>
            ))}
          </div>
        </>
      );
    case "key": {
      const key = keys.find((k) => k.id === view.id)!;
      return (
        <>
          <TrayHeader
            icon={<Hero Icon={key.Icon} color={key.accent} />}
            title={key.title}
            description={
              <>
                <span className="block text-label text-foreground">{key.detail}</span>
                <span className="mt-2 block">{key.about}</span>
              </>
            }
          />
          <TrayActions>
            <Button variant="secondary" size="lg" className="h-12" onClick={close}>
              Done
            </Button>
          </TrayActions>
        </>
      );
    }
    case "signout":
      return (
        <>
          <TrayHeader
            icon={<Hero Icon={SignOutIcon} color="var(--color-negative)" />}
            title="Sign out of Fuse?"
            description="Your keys stay safe while you’re away. Sign back in with Apple any time."
          />
          <TrayActions>
            <Button variant="secondary" size="lg" className="h-12" onClick={close}>
              Cancel
            </Button>
            <Button
              size="lg"
              onClick={() => router.replace("/onboarding-welcome", { transitionTypes: ["pop"] })}
              className="h-12 bg-negative hover:bg-negative/85"
            >
              Sign out
            </Button>
          </TrayActions>
        </>
      );
  }
}

export function SettingsView() {
  const [open, setOpen] = useState(false);
  // Outlives `open` until the close animation ends, so the tray doesn't empty mid-exit.
  const [stack, setStack] = useState<View[]>([]);
  const view = stack.at(-1);

  function show(root: TrayRoot) {
    setStack([{ name: root }]);
    setOpen(true);
  }

  return (
    <div className="mt-6 max-w-xl lg:grid lg:max-w-none lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-12">
      <div>
        <div className="flex items-center gap-4">
          <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-ink text-heading text-white">
            {profile.initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-heading">{profile.name}</p>
            <CopyButton text={profile.address} label={`Copy address ${profile.address}`}>
              <span className="text-body text-muted-foreground">{shortAddress(profile.address)}</span>
            </CopyButton>
          </div>
        </div>

        <PlusCard />
      </div>

      <div>
        {sections.map((section, i) => (
          <section key={section.title ?? i} className={section.title ? "mt-8" : "mt-4 lg:mt-0"}>
            {section.title && <h2 className={sectionLabel}>{section.title}</h2>}
            <div className="-mx-3">
              {section.rows.map((item) => (
                <SettingsRow key={item.label} item={item} onOpen={show} />
              ))}
            </div>
          </section>
        ))}
        <p className="mt-8 text-center text-caption text-faint">{version}</p>
      </div>

      <Tray
        open={open}
        onOpenChange={setOpen}
        view={view ? viewKey(view) : ""}
        onBack={stack.length > 1 ? () => setStack((s) => s.slice(0, -1)) : undefined}
        onClosed={() => setStack([])}
      >
        {view && <TrayBody view={view} push={(next) => setStack((s) => [...s, next])} close={() => setOpen(false)} />}
      </Tray>
    </div>
  );
}
