"use client";

import Link from "next/link";
import { useState } from "react";
import { FaceIdIcon, WarningIcon } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Drawer, FloatingSheetContent, FloatingSheetHeader } from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { phone } from "@/lib/wallet/phone";
import { RowBody } from "../../history/_components/tx-row";
import { dayLabel, transactions } from "../../history/data";
import { sectionLabel } from "../../_components/list";
import { Money } from "../../_components/money";
import { useWallet } from "../../_components/wallet";
import { tiles, type Tile, type TileId } from "../data";
import { AssetTile, tileLooks } from "./asset-tile";
import { PromoStack } from "./promo-stack";

/** The Home grid. Tiles without a screen of their own, and the Earn promo, open an account sheet in place. */
export function Accounts() {
  const [version, setVersion] = useState(0);
  const wallet = useWallet(version);
  // Cash is the wallet's USDC; the other tiles stay mocked.
  const shown = wallet ? tiles.map((t) => (t.id === "cash" ? { ...t, value: wallet.usdc } : t)) : tiles;
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
        {wallet?.recovering && <RecoveryAlert onCancelled={() => setVersion((v) => v + 1)} />}
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
            <AccountSheet tile={shown.find((t) => t.id === id)!} />
          </div>
        </FloatingSheetContent>
      </Drawer>
    </>
  );
}

function RecoveryAlert({ onCancelled }: { onCancelled: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const cancel = async () => {
    setBusy(true);
    setFailed(false);
    const ok = await phone.cancelRecovery().then(() => true, () => false);
    setBusy(false);
    if (ok) onCancelled();
    else setFailed(true);
  };

  return (
    <section role="alert" className="flex gap-3 rounded-[22px] bg-secondary p-4">
      <WarningIcon className="shrink-0 text-pending" />
      <div className="min-w-0 flex-1">
        <h2 className="text-label">Someone started recovering your wallet</h2>
        <p className="mt-1 text-body text-pretty text-muted-foreground">
          If it wasn&apos;t you, cancel it before the 48-hour hold ends. Your wallet stays on this phone.
        </p>
        {failed && <p className="mt-2 text-caption text-negative">The recovery wasn&apos;t cancelled. Try again.</p>}
        <Button size="sm" onClick={cancel} disabled={busy} aria-busy={busy} className="mt-3">
          {busy ? <Spinner aria-hidden /> : <FaceIdIcon size={16} />}
          Cancel recovery
        </Button>
      </div>
    </section>
  );
}

function AccountSheet({ tile }: { tile: Tile }) {
  const { Icon, fill } = tileLooks[tile.id];
  const activity = transactions.filter((t) => t.account === tile.id).slice(0, 4);

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
        <p className="mt-1 text-amount">
          <Money value={tile.value} />
        </p>
        {"about" in tile && <p className="mt-1 text-body text-pretty text-muted-foreground">{tile.about}</p>}
      </FloatingSheetHeader>

      <section aria-label="Recent activity" className="mt-8">
        <h3 className={sectionLabel}>Recent activity</h3>
        <ul>
          {activity.map((t) => (
            <li key={t.id} className="flex min-h-[68px] items-center gap-4 py-3">
              <RowBody tx={t} when={dayLabel(t.date)} />
            </li>
          ))}
        </ul>
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
