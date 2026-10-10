"use client";

import {
  BankIcon,
  BellIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CloudIcon,
  CopyIcon,
  CreditCardIcon,
  CurrencyDollarIcon,
  EnvelopeIcon,
  EyeSlashIcon,
  IdentificationCardIcon,
  LifebuoyIcon,
  ScanSmileyIcon,
  SignOutIcon,
  type Icon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { account, currency, plus, profile, recoveryEmail, supportEmail, version } from "../data";

const ring = "outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-inset";
const rowBase = `relative flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left after:absolute after:right-0 after:bottom-0 after:left-[58px] after:h-px after:bg-black/[0.06] last:after:hidden ${ring}`;
const pressable = "transition-colors duration-150 ease-out hover:bg-black/[0.02] active:bg-black/[0.04]";
const hidden = { opacity: 0, scale: 0.25, filter: "blur(4px)" };

function Tile({ Glyph, color }: { Glyph: Icon; color: string }) {
  return (
    <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] text-white" style={{ backgroundColor: color }}>
      <Glyph weight="fill" size={18} aria-hidden />
    </span>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="px-4 pb-2 text-[13px] leading-4 font-medium text-[#adadad]">{label}</h2>
      <div className="overflow-hidden rounded-[22px] border border-black/[0.035] bg-surface">{children}</div>
    </section>
  );
}

function Label({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-[15px] leading-5">{children}</span>
      {sub && <span className="block text-[13px] leading-4 text-[#adadad]">{sub}</span>}
    </span>
  );
}

const Chevron = () => <CaretRightIcon weight="bold" size={14} aria-hidden className="shrink-0 text-black/[0.18]" />;
const Value = ({ children }: { children: ReactNode }) => <span className="shrink-0 text-[15px] text-[#adadad]">{children}</span>;

function StaticRow({ Glyph, color, label, sub, value }: { Glyph: Icon; color: string; label: string; sub?: string; value: ReactNode }) {
  return (
    <div className={rowBase}>
      <Tile Glyph={Glyph} color={color} />
      <Label sub={sub}>{label}</Label>
      {value}
    </div>
  );
}

function LinkRow({ Glyph, color, label, href, trailing, external }: { Glyph: Icon; color: string; label: string; href: string; trailing?: ReactNode; external?: boolean }) {
  const inner = (
    <>
      <Tile Glyph={Glyph} color={color} />
      <span className="min-w-0 flex-1 text-[15px] leading-5">{label}</span>
      {trailing}
      <Chevron />
    </>
  );
  const cls = `${rowBase} ${pressable}`;
  return external ? (
    <a href={href} className={cls}>{inner}</a>
  ) : (
    <Link href={href} transitionTypes={["push"]} className={cls}>{inner}</Link>
  );
}

function SignOut() {
  const router = useRouter();
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button type="button" className={`${rowBase} ${pressable}`}>
          <Tile Glyph={SignOutIcon} color="var(--color-negative)" />
          <span className="min-w-0 flex-1 text-[15px] leading-5 text-negative">Sign out</span>
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] tracking-[-0.24px]">
          <div className="px-3">
            <span className="grid size-12 place-items-center rounded-full bg-negative/10 text-negative">
              <SignOutIcon weight="fill" size={24} aria-hidden />
            </span>
            <DrawerTitle className="mt-4 text-[20px]">Sign out of Fuse?</DrawerTitle>
            <DrawerDescription className="mt-1 text-black/45">
              Your keys keep your wallet safe while you are away. Sign back in with Apple any time.
            </DrawerDescription>
          </div>
          <Button onClick={() => router.replace("/onboarding-welcome")} className="mt-7 w-full bg-negative hover:bg-negative/85">
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

function ToggleRow({ Glyph, color, label, defaultChecked }: { Glyph: Icon; color: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className={`${rowBase} cursor-pointer has-focus-visible:ring-2 has-focus-visible:ring-black/20 has-focus-visible:ring-inset`}>
      <Tile Glyph={Glyph} color={color} />
      <Label>{label}</Label>
      <Switch defaultChecked={defaultChecked} aria-label={label} />
    </label>
  );
}

function Active() {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[15px] text-[#adadad]">
      <span aria-hidden className="size-1.5 rounded-full bg-positive" />
      Active
    </span>
  );
}

function CopyAddress() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const short = `${profile.address.slice(0, 4)}...${profile.address.slice(-4)}`;
  return (
    <>
      <button
        type="button"
        onClick={() => navigator.clipboard?.writeText(profile.address).then(() => setCopied(true), () => {})}
        aria-label={`Copy address ${profile.address}`}
        className="-my-2 flex min-h-11 items-center gap-1.5 rounded-md text-[15px] text-[#8a8a8a] outline-none transition-[scale] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-black/20 active:scale-[0.96]"
      >
        {short}
        <span className="grid size-4 place-items-center">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={copied ? "check" : "copy"}
              initial={hidden}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={hidden}
              transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            >
              {copied ? <CheckCircleIcon weight="fill" className="size-4 text-positive" /> : <CopyIcon weight="duotone" className="size-4" />}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>
      <span role="status" className="sr-only">{copied ? "Address copied" : ""}</span>
    </>
  );
}

export function SettingsView() {
  return (
    <div className="mt-6 max-w-xl">
      <div className="flex items-center gap-4 px-1">
        <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-black text-[21px] font-semibold tracking-[-0.01em] text-white">
          {profile.initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[22px] leading-7 font-bold tracking-[-0.02em]">{profile.name}</p>
          <CopyAddress />
        </div>
      </div>

      <Link
        href="/fuse-plus"
        transitionTypes={["push"]}
        className="mt-6 flex items-center gap-3.5 rounded-[22px] bg-black p-4 text-white outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-2 active:scale-[0.96]"
      >
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[13px] bg-white/10">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" className="size-5">
            <path d="M12 4v16M4 12h16" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[17px] leading-[22px] font-semibold">
            {plus.title}
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[12px] leading-4 font-medium">{plus.status}</span>
          </span>
          <span className="mt-0.5 block text-[13px] leading-[17px] text-pretty text-white/50">{plus.benefits}</span>
        </span>
        <CaretRightIcon weight="bold" size={14} aria-hidden className="shrink-0 text-white/30" />
      </Link>

      <Group label="Account">
        <LinkRow
          Glyph={IdentificationCardIcon}
          color="#0a84ff"
          label="Identity verification"
          href="/pending-verification"
          trailing={<span className="shrink-0 rounded-full bg-pending/12 px-2.5 py-0.5 text-[13px] leading-4 font-medium text-pending">{account.verification}</span>}
        />
        <StaticRow Glyph={BankIcon} color="#34c759" label="Bank account" value={<Value>{account.bank}</Value>} />
        <StaticRow Glyph={CreditCardIcon} color="#000" label="Fuse Card" value={<Value>{account.card}</Value>} />
      </Group>

      <Group label="Security">
        <StaticRow Glyph={ScanSmileyIcon} color="#0a84ff" label="Device Key" value={<Active />} />
        <StaticRow Glyph={CloudIcon} color="#ff5a1f" label="2FA Key" value={<Active />} />
        <StaticRow Glyph={EnvelopeIcon} color="#a945e8" label="Recovery Key" sub={recoveryEmail} value={<Active />} />
      </Group>

      <Group label="Preferences">
        <ToggleRow Glyph={EyeSlashIcon} color="var(--color-fuse-blue)" label="Hide My Wallet by default" />
        <ToggleRow Glyph={BellIcon} color="#ff9f0a" label="Notifications" defaultChecked />
        <StaticRow Glyph={CurrencyDollarIcon} color="#8e8e93" label="Currency" value={<Value>{currency}</Value>} />
      </Group>

      <Group label="Support">
        <LinkRow Glyph={LifebuoyIcon} color="#30b0c7" label="Help & support" href={`mailto:${supportEmail}`} external />
        <SignOut />
      </Group>

      <p className="mt-6 text-center text-[13px] text-[#c8c8c8]">{version}</p>
    </div>
  );
}
