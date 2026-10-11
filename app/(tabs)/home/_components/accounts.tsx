"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FaceIdIcon, LockIcon, PhoneIcon, RestoreIcon, WarningIcon, type Icon } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { DemoTag } from "@/components/ui/demo-tag";
import { Drawer, FloatingSheetContent, FloatingSheetHeader } from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { phone } from "@/lib/wallet/phone";
import { RowBody } from "../../history/_components/tx-row";
import { dayLabel, type Tx } from "../../history/data";
import { transferToTx } from "../../history/live";
import { sectionLabel } from "../../_components/list";
import { Money } from "../../_components/money";
import { forgetWallet, isUnlinked, phoneDate, refreshWallet, useActivity, useWallet, type WalletSnapshot } from "../../_components/wallet";
import { needsLink, tiles, type Tile, type TileId } from "../data";
import { AssetTile, lockedFill, tileLooks } from "./asset-tile";
import { MoneyPlaceholder } from "./blur-money";
import { PromoStack } from "./promo-stack";


/**
 * Home's tiles with Cash read from the wallet; Accounts and the chart share the store, so both change in one commit.
 * Until Cash is known every tile holds, so Home's numbers type in together. The wallet holds only its USDC, so its
 * other accounts start at zero.
 */
export function useTiles(): Tile[] {
  const wallet = useWallet();
  // Cash is the wallet's USDC; until it's read every tile holds its place. A forgotten network's wallet holds nothing.
  const cash = wallet.status === "ready" ? wallet.wallet.usdc : wallet.status === "missing" ? 0 : undefined;
  return useMemo(() => tiles.map((t) => ({ ...t, value: cash === undefined ? undefined : t.id === "cash" ? cash : 0 })), [cash]);
}

/** The Home grid. Tiles without a screen of their own, and the Earn promo, open an account sheet in place. */
export function Accounts() {
  const wallet = useWallet();
  const shown = useTiles();
  // Read while Home shows, so the Cash sheet opens on its transfers.
  useActivity();
  const alert = alertFor(wallet);
  // Until the wallet is linked, every account but Cash is locked.
  const locked = (id: TileId) => isUnlinked(wallet) && needsLink(id);
  const [open, setOpen] = useState(false);
  // Kept after close so the sheet's content doesn't vanish mid-exit.
  const [id, setId] = useState<TileId>("cash");
  const show = (next: TileId) => {
    setId(next);
    setOpen(true);
  };

  return (
    <>
      <div className="mt-6 flex flex-col gap-3 lg:mt-10">
        {alert ? (
          <WalletAlert key={alert.kind} alert={alert} />
        ) : (
          wallet.status === "offline" && (
            <p role="status" className="text-caption text-muted-foreground">
              Can&apos;t reach Swissquote. Your balance updates when it&apos;s back.
            </p>
          )
        )}
        <section aria-label="Accounts" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-2">
          {shown.map((tile, i) => (
            <AssetTile key={tile.id} tile={tile} index={i} locked={locked(tile.id)} onOpen={() => show(tile.id)} />
          ))}
          <PromoStack className="col-span-2 md:col-span-4 lg:col-span-2" onOpenAccount={show} />
        </section>
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <FloatingSheetContent>
          <div className="min-h-0 overflow-y-auto px-4 pb-4">
            <AccountSheet tile={shown.find((t) => t.id === id)!} wallet={wallet} locked={locked(id)} />
          </div>
        </FloatingSheetContent>
      </Drawer>
    </>
  );
}

/** `note`: a second line the card adds, as when a locked phone's wallet is being recovered. */
type Alert = {
  kind: "locked" | "recovering" | "restoring" | "cancelled" | "moved" | "missing";
  Icon: Icon;
  tone: string;
  title: string;
  line: string;
  note?: string;
};

/** What Home has to say about the wallet itself, if anything. */
function alertFor(wallet: WalletSnapshot): Alert | undefined {
  if (wallet.status === "missing")
    return {
      kind: "missing",
      Icon: WarningIcon,
      tone: "text-pending",
      title: "Swissquote can’t find this wallet",
      line: "The network it lived on was reset.",
    };
  if (wallet.status !== "ready") return undefined;
  const { controls, locked, recovery, restoring } = wallet.wallet;
  // Ahead of a recovery someone started: a locked phone can't cancel it with Face ID, so its card says how else to.
  if (locked)
    return {
      kind: "locked",
      Icon: LockIcon,
      tone: "text-muted-foreground",
      title: "Swissquote locked this phone",
      line: "It was reported lost, so it can’t send from your wallet. If you found it, call Swissquote to unlock it.",
      note: recovery ? "Someone started recovering your wallet. If it wasn’t you, call Swissquote or cancel it with your Recovery Key." : undefined,
    };
  if (controls)
    return recovery && !recovery.mine
      ? {
          kind: "recovering",
          Icon: WarningIcon,
          tone: "text-pending",
          title: "Someone started recovering your wallet",
          line: `If it wasn’t you, cancel it before ${phoneDate(wallet.wallet, recovery.executeAfter)}.`,
        }
      : undefined;
  return recovery?.mine
    ? {
        kind: "restoring",
        Icon: RestoreIcon,
        tone: "text-purple",
        title: "Your wallet is being restored",
        line: `It completes on ${phoneDate(wallet.wallet, recovery.executeAfter)}, and this phone can send once it does.`,
      }
    : restoring
      ? {
          kind: "cancelled",
          Icon: RestoreIcon,
          tone: "text-muted-foreground",
          title: "Your recovery was cancelled",
          line: "Your wallet is unchanged. To restore it on this phone, recover again with your Recovery Key.",
        }
      : {
          kind: "moved",
          Icon: PhoneIcon,
          tone: "text-muted-foreground",
          title: "Your wallet moved to another phone",
          line: "It was recovered on another phone, so this one can’t send from it any more.",
        };
}

function WalletAlert({ alert: { kind, Icon, tone, title, line, note } }: { alert: Alert }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const cancel = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await phone.cancelRecovery().then(() => true, () => false);
    if (ok) await refreshWallet();
    setBusy(false);
    setFailed(!ok);
  };

  const remove = () => {
    forgetWallet();
    router.replace("/onboarding-welcome");
  };

  return (
    <section role="alert" className="flex gap-3 rounded-[22px] bg-secondary p-4">
      <Icon className={`shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1">
        <h2 className="text-label">{title}</h2>
        <p className="mt-1 text-body text-pretty text-muted-foreground">{line}</p>
        {note && <p className="mt-2 text-body text-pretty">{note}</p>}
        {failed && <p className="mt-2 text-caption text-negative">The recovery wasn&apos;t cancelled. Try again.</p>}
        {kind === "recovering" ? (
          <Button size="sm" onClick={cancel} disabled={busy} aria-busy={busy} className="mt-3">
            {busy ? <Spinner aria-hidden /> : <FaceIdIcon size={16} />}
            Cancel recovery
          </Button>
        ) : kind === "restoring" || kind === "cancelled" || note ? (
          <Link href="/recover" transitionTypes={["push"]} className={buttonVariants({ size: "sm", className: "mt-3" })}>
            {kind === "restoring" ? "View progress" : kind === "cancelled" ? "Recover again" : "Cancel with Recovery Key"}
          </Link>
        ) : (
          kind !== "locked" && (
            <Button size="sm" onClick={remove} className="mt-3">
              Remove from this phone
            </Button>
          )
        )}
      </div>
    </section>
  );
}

/** The account's latest rows: the wallet's own transfers, all Cash. Undefined until they're read. */
function recentActivity(id: TileId, wallet: WalletSnapshot): Tx[] | undefined {
  if (id !== "cash" || wallet.status === "missing" || wallet.status === "none") return [];
  if (wallet.status !== "ready") return undefined;
  return wallet.wallet.activity?.slice(0, 4).map((t) => transferToTx(t, wallet.wallet));
}

function AccountSheet({ tile, wallet, locked }: { tile: Tile; wallet: WalletSnapshot; locked: boolean }) {
  const { Icon, fill } = tileLooks[tile.id];
  const activity = recentActivity(tile.id, wallet);

  return (
    <>
      <FloatingSheetHeader
        icon={
          <span aria-hidden className={`grid size-14 place-items-center rounded-[18px] ${locked ? lockedFill : `text-white ${fill}`}`}>
            <Icon size={32} />
          </span>
        }
        title={tile.label}
      >
        {locked ? (
          <p className="mt-1 text-body text-pretty text-muted-foreground">
            {tile.label} is a Swissquote service. Link your wallet to your Swissquote account to unlock it.
          </p>
        ) : (
          <>
            <p className="mt-1 text-amount">{tile.value === undefined ? <MoneyPlaceholder /> : <Money value={tile.value} />}</p>
            {"about" in tile && <p className="mt-1 text-body text-pretty text-muted-foreground">{tile.about}</p>}
          </>
        )}
        {tile.demo && <DemoTag className="mt-3" />}
      </FloatingSheetHeader>

      {locked ? (
        <Link href="/settings" transitionTypes={["tab-forward"]} className={buttonVariants({ className: "mt-8 w-full" })}>
          Link your Swissquote account
        </Link>
      ) : (
        <>
          <section aria-label="Recent activity" className="mt-8">
            <h3 className={sectionLabel}>Recent activity</h3>
            <ul>
              {activity?.map((t) => (
                <li key={t.id} className="flex min-h-[68px] items-center gap-4 py-3">
                  <RowBody tx={t} when={dayLabel(t.date)} />
                </li>
              ))}
            </ul>
            {activity?.length === 0 && <p className="py-3 text-body text-muted-foreground">No activity yet</p>}
          </section>

          <Link
            href={`/history?account=${tile.id}`}
            transitionTypes={["tab-forward"]}
            className={buttonVariants({ variant: "secondary", className: "mt-4 w-full" })}
          >
            See all activity
          </Link>
        </>
      )}
    </>
  );
}
