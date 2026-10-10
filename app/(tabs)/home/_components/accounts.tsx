"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { investmentsValue, portfolio } from "@/app/coin-breakdown/data";
import { FaceIdIcon, PhoneIcon, RestoreIcon, WarningIcon, type Icon } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Drawer, FloatingSheetContent, FloatingSheetHeader } from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { phone } from "@/lib/wallet/phone";
import { RowBody } from "../../history/_components/tx-row";
import { dayLabel, transactions, type Tx } from "../../history/data";
import { toTxs } from "../../history/live";
import { sectionLabel } from "../../_components/list";
import { Money } from "../../_components/money";
import { forgetWallet, onPhoneClock, refreshWallet, useActivity, useWallet, type Wallet, type WalletSnapshot } from "../../_components/wallet";
import { tiles, type Tile, type TileId } from "../data";
import { AssetTile, tileLooks } from "./asset-tile";
import { MoneyPlaceholder } from "./blur-money";
import { PromoStack } from "./promo-stack";


/**
 * Home's tiles with Cash read from the wallet; Accounts and the chart share the store, so both change in one commit.
 * Until Cash is known every tile holds, so Home's numbers type in together.
 */
export function useTiles(): Tile[] {
  const wallet = useWallet();
  const live = wallet.status === "ready" ? wallet.wallet : undefined;
  // Cash is the wallet's USDC; until it's read every tile holds its place. A forgotten network's wallet holds nothing.
  const cash = live ? live.usdc : wallet.status === "missing" ? 0 : undefined;
  // Investments holds the wallet's ETH where there is a pool, beside the demo coins.
  const investments = investmentsValue(portfolio(live));
  return useMemo(
    () =>
      tiles.map((t) => ({
        ...t,
        value: cash === undefined ? undefined : t.id === "cash" ? cash : t.id === "investments" ? investments : t.value,
      })),
    [cash, investments],
  );
}

/** The Home grid. Tiles without a screen of their own, and the Earn promo, open an account sheet in place. */
export function Accounts() {
  const wallet = useWallet();
  const shown = useTiles();
  // Read while Home shows, so the Cash sheet opens on its transfers.
  useActivity();
  const alert = alertFor(wallet);
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
            <AssetTile key={tile.id} tile={tile} index={i} onOpen={() => show(tile.id)} />
          ))}
          <PromoStack className="col-span-2 md:col-span-4 lg:col-span-2" onOpenAccount={show} />
        </section>
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <FloatingSheetContent>
          <div className="min-h-0 overflow-y-auto px-4 pb-4">
            <AccountSheet tile={shown.find((t) => t.id === id)!} wallet={wallet} />
          </div>
        </FloatingSheetContent>
      </Drawer>
    </>
  );
}

const restoreDate = (wallet: Wallet, executeAfter: number) =>
  onPhoneClock(wallet, executeAfter).toLocaleString("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

type Alert = { kind: "recovering" | "restoring" | "cancelled" | "moved" | "missing"; Icon: Icon; tone: string; title: string; line: string };

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
  const { controls, recovery, restoring } = wallet.wallet;
  if (controls)
    return recovery && !recovery.mine
      ? {
          kind: "recovering",
          Icon: WarningIcon,
          tone: "text-pending",
          title: "Someone started recovering your wallet",
          line: `If it wasn’t you, cancel it before ${restoreDate(wallet.wallet, recovery.executeAfter)}.`,
        }
      : undefined;
  return recovery?.mine
    ? {
        kind: "restoring",
        Icon: RestoreIcon,
        tone: "text-purple",
        title: "Your wallet is being restored",
        line: `It completes on ${restoreDate(wallet.wallet, recovery.executeAfter)}, and this phone can send once it does.`,
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

function WalletAlert({ alert: { kind, Icon, tone, title, line } }: { alert: Alert }) {
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
        {failed && <p className="mt-2 text-caption text-negative">The recovery wasn&apos;t cancelled. Try again.</p>}
        {kind === "recovering" ? (
          <Button size="sm" onClick={cancel} disabled={busy} aria-busy={busy} className="mt-3">
            {busy ? <Spinner aria-hidden /> : <FaceIdIcon size={16} />}
            Cancel recovery
          </Button>
        ) : kind === "restoring" || kind === "cancelled" ? (
          <Link href="/recover" transitionTypes={["push"]} className={buttonVariants({ size: "sm", className: "mt-3" })}>
            {kind === "restoring" ? "View progress" : "Recover again"}
          </Link>
        ) : (
          <Button size="sm" onClick={remove} className="mt-3">
            Remove from this phone
          </Button>
        )}
      </div>
    </section>
  );
}

/** The account's latest rows: the wallet's own transfers for Cash, mock ones otherwise. Undefined until they're read. */
function recentActivity(id: TileId, wallet: WalletSnapshot): Tx[] | undefined {
  if (id !== "cash") return transactions.filter((t) => t.account === id).slice(0, 4);
  if (wallet.status === "missing") return [];
  if (wallet.status !== "ready") return undefined;
  const activity = wallet.wallet.activity;
  return activity && toTxs(activity, wallet.wallet).filter((t) => t.account === "cash").slice(0, 4);
}

function AccountSheet({ tile, wallet }: { tile: Tile; wallet: WalletSnapshot }) {
  const { Icon, fill } = tileLooks[tile.id];
  const activity = recentActivity(tile.id, wallet);

  return (
    <>
      <FloatingSheetHeader
        icon={
          <span aria-hidden className={`grid size-14 place-items-center rounded-[18px] text-white ${fill}`}>
            <Icon size={32} />
          </span>
        }
        title={tile.label}
      >
        <p className="mt-1 text-amount">{tile.value === undefined ? <MoneyPlaceholder /> : <Money value={tile.value} />}</p>
        {"about" in tile && <p className="mt-1 text-body text-pretty text-muted-foreground">{tile.about}</p>}
      </FloatingSheetHeader>

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
  );
}
