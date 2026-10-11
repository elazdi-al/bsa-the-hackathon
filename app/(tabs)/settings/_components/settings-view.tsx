"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { shortAddress } from "@/app/choose-recipient/data";
import { BankIcon, ChevronRightIcon, FaceIdIcon, PlusIcon, ShieldIcon, SignOutIcon, VerifiedIcon, type Icon } from "@/components/icons";
import { SwissquoteMark } from "@/components/swissquote-mark";
import { Button } from "@/components/ui/button";
import { DemoTag } from "@/components/ui/demo-tag";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tray, TrayActions, TrayHeader } from "@/components/ui/tray";
import { cn } from "@/lib/utils";
import { phone, type SignedIn } from "@/lib/wallet/phone";
import { rowPress } from "../../_components/list";
import { keepSession, storedSession, useSignedIn } from "../../_components/session";
import { forgetWallet, refreshWallet, shownAddress, useWallet } from "../../_components/wallet";
import { keys, linkAdds, sections, version, type KeyId, type Row, type TrayRoot } from "../data";

type View = { name: TrayRoot } | { name: "key"; id: KeyId };

const viewKey = (view: View) => (view.name === "key" ? `key-${view.id}` : view.name);

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-ring";
// Inside each section's -mx-3, the 12px padding lets the pressed tint bleed past the column while glyphs align with the card.
const row = `flex min-h-14 w-full items-center gap-4 rounded-2xl px-3 py-2 text-left ${focusRing} focus-visible:ring-inset`;

const Chevron = () => <ChevronRightIcon size={16} className="shrink-0 text-faint" />;

function SettingsRow({ item, onOpen }: { item: Row; onOpen: (root: TrayRoot) => void }) {
  const body = (
    <>
      <item.Icon className={`shrink-0 ${item.destructive ? "text-negative" : "text-muted-foreground"}`} />
      <span className="min-w-0 flex-1">
        <span className={cn("flex items-center gap-2 text-label", item.destructive && "text-negative")}>
          <span className="truncate">{item.label}</span>
          {item.demo && <DemoTag />}
        </span>
        {item.detail && <span className="block truncate text-body text-muted-foreground">{item.detail}</span>}
      </span>
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
    case "link":
      return (
        <a href={item.href} target="_blank" rel="noreferrer" className={`${row} ${rowPress}`}>
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

const reveal = (shown: unknown) => cn("transition-[opacity,visibility] duration-200 ease-out", !shown && "invisible opacity-0");

/**
 * Whether the wallet is read yet, and the Swissquote client it is linked to, when this phone is signed in as them:
 * Swissquote names a wallet's owner only to the owner's own session.
 */
function useLinked() {
  const snapshot = useWallet();
  const client = useSignedIn()?.client;
  const ready = snapshot.status === "ready";
  return { ready, client: ready && client && snapshot.wallet.owner === client.number ? client : undefined };
}

// Fine grain over the card, so the orange reads as a material rather than a flat fill.
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")`;

/**
 * The client's card: their plan and wallet address, like the card in a wallet. A member's is a quiet orange; anyone
 * else's is a plain wallet card offering Plus. It opens Swissquote Plus either way.
 */
function MemberCard() {
  const snapshot = useWallet();
  const address = shownAddress(snapshot);
  const member = snapshot.status === "ready" && snapshot.wallet.plus !== null;
  return (
    <Link
      href="/plus"
      transitionTypes={["push"]}
      className={cn(
        "relative isolate flex aspect-video flex-col justify-between rounded-[28px] p-5 transition-transform duration-150 ease-out active:scale-[0.96] focus-visible:ring-offset-2",
        focusRing,
        member ? "bg-linear-225/oklch from-[oklch(0.71_0.165_50)] to-[oklch(0.63_0.18_41)] text-white" : "bg-secondary",
      )}
    >
      {member && <span aria-hidden className="absolute inset-0 -z-10 rounded-[inherit] bg-size-[200px] opacity-40 mix-blend-overlay" style={{ backgroundImage: GRAIN }} />}
      <span className="flex items-center justify-between gap-2">
        <span className="text-label">{member ? "Swissquote Plus" : "Swissquote Wallet"}</span>
        {/* Only once the wallet reads, so a member's card doesn't offer Plus for a moment. */}
        {!member && (
          <span className={cn("flex h-8 items-center gap-1 rounded-full bg-white px-3 text-body font-semibold text-brand", reveal(snapshot.status === "ready"))}>
            <PlusIcon size={16} />
            Get Plus
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className={cn("block text-body", member ? "text-white/80" : "text-muted-foreground", reveal(address))}>
          {address ? shortAddress(address) : "0x0000...0000"}
        </span>
      </span>
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

/**
 * Links the wallet to the client's Swissquote account: the phone signs in (MOCKED), then the passkey signs, with Face ID,
 * that the wallet is theirs. A wallet already linked, as after a recovery, links back to the same client.
 */
function LinkView({ done }: { done: () => void }) {
  const signing = useRef<Promise<SignedIn>>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Signed in while the client reads, so the tap goes straight to Face ID, which needs the tap's user activation.
  const signIn = () => {
    signing.current = phone.signIn(storedSession()?.session);
    signing.current.catch(() => {});
  };
  useEffect(() => {
    if (!signing.current) signIn();
  }, []);

  async function link() {
    setBusy(true);
    setError(undefined);
    try {
      keepSession(await phone.link(await signing.current!));
      await refreshWallet();
      done();
    } catch {
      setError("Your wallet wasn't linked. Try again.");
      signIn();
    }
    setBusy(false);
  }

  return (
    <>
      <TrayHeader
        icon={<SwissquoteMark size={56} />}
        title="Link your Swissquote account"
        description="Optional. Without it, your wallet pays its own network fees."
      />
      <ul className="mt-6 space-y-4">
        {linkAdds.map(({ Icon, text }) => (
          <li key={text} className="flex gap-3 text-body text-pretty">
            <Icon size={20} className="shrink-0 text-brand" />
            {text}
          </li>
        ))}
      </ul>
      <TrayActions>
        <Button size="lg" className="h-12" onClick={link} disabled={busy} aria-busy={busy}>
          {busy ? <Spinner aria-hidden className="size-5" /> : <FaceIdIcon size={20} />}
          {busy ? "Linking" : "Link with Face ID"}
        </Button>
      </TrayActions>
      {error && (
        <p role="alert" className="mt-3 text-center text-caption text-negative">
          {error}
        </p>
      )}
      <p data-demo="" className="mt-3 text-center text-caption text-muted-foreground">
        Mock sign-in: you link as a made-up Swissquote client, or as the one who linked this wallet before.
      </p>
    </>
  );
}

function TrayBody({ view, push, close, remove }: { view: View; push: (next: View) => void; close: () => void; remove: () => void }) {
  switch (view.name) {
    case "link":
      return <LinkView done={close} />;
    case "keys":
      return (
        <>
          <TrayHeader
            icon={<Hero Icon={ShieldIcon} color="var(--color-brand)" />}
            title="Your keys"
            description="Your Passkey approves every payment and your Wallet Key signs it. Your Recovery Key gets you back in."
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
                <Chevron />
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
    case "remove":
      return (
        <>
          <TrayHeader
            icon={<Hero Icon={SignOutIcon} color="var(--color-negative)" />}
            title="Remove your wallet from this phone?"
            description="Your money stays in your wallet on Base. To use it on this phone again, you’ll recover it with your Recovery Key after a 48-hour hold."
          />
          <TrayActions>
            <Button variant="secondary" size="lg" className="h-12" onClick={close}>
              Cancel
            </Button>
            <Button size="lg" onClick={remove} className="h-12 bg-negative hover:bg-negative/85">
              Remove
            </Button>
          </TrayActions>
        </>
      );
  }
}

export function SettingsView() {
  const router = useRouter();
  const { ready, client } = useLinked();
  const [open, setOpen] = useState(false);
  // Outlives `open` until the close animation ends, so the tray doesn't empty mid-exit.
  const [stack, setStack] = useState<View[]>([]);
  const view = stack.at(-1);

  // Linked: the client. Unlinked: the offer to link.
  const account: Row[] = client
    ? [
        {
          kind: "info",
          label: "Swissquote account",
          detail: `Client ${client.number}`,
          value: (
            <span className="flex items-center gap-1.5">
              <VerifiedIcon size={16} className="text-positive" />
              Linked
            </span>
          ),
          Icon: BankIcon,
        },
      ]
    : [{ kind: "tray", opens: "link", label: "Link your Swissquote account", Icon: BankIcon }];

  function show(root: TrayRoot) {
    setStack([{ name: root }]);
    setOpen(true);
  }

  function remove() {
    forgetWallet();
    router.replace("/onboarding-welcome", { transitionTypes: ["pop"] });
  }

  return (
    <div className="mt-6 max-w-xl lg:grid lg:max-w-none lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start lg:gap-12">
      <MemberCard />

      <div>
        {[[...(ready ? account : []), ...sections[0]], ...sections.slice(1)].map((rows, i) => (
          <div key={i} className={`-mx-3 ${i ? "mt-6" : "mt-6 lg:mt-0"}`}>
            {/* Holds the account row's place while the wallet loads, so the rows below don't jump. */}
            {!i && !ready && <div className="min-h-14" />}
            {rows.map((item) => (
              <SettingsRow key={item.label} item={item} onOpen={show} />
            ))}
          </div>
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
        {view && <TrayBody view={view} push={(next) => setStack((s) => [...s, next])} close={() => setOpen(false)} remove={remove} />}
      </Tray>
    </div>
  );
}
