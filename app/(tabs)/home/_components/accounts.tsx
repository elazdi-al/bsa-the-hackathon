"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Drawer, FloatingSheetContent, FloatingSheetHeader } from "@/components/ui/drawer";
import { RowBody } from "../../history/_components/tx-row";
import { dayLabel, transactions } from "../../history/data";
import { sectionLabel } from "../../_components/list";
import { Money } from "../../_components/money";
import { tiles, type Tile, type TileId } from "../data";
import { AssetTile, tileLooks } from "./asset-tile";
import { PromoStack } from "./promo-stack";

/** The Home grid. Tiles without a screen of their own, and the Earn promo, open an account sheet in place. */
export function Accounts() {
  const [open, setOpen] = useState(false);
  // Kept after close so the sheet's content doesn't vanish mid-exit.
  const [id, setId] = useState<TileId>("cash");
  const show = (next: TileId) => {
    setId(next);
    setOpen(true);
  };

  return (
    <>
      <section aria-label="Accounts" className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:mt-10 lg:grid-cols-2">
        {tiles.map((tile, i) => (
          <AssetTile key={tile.id} tile={tile} index={i} onOpen={() => show(tile.id)} />
        ))}
        <PromoStack className="col-span-2 md:col-span-4 lg:col-span-2" onOpenAccount={show} />
      </section>

      <Drawer open={open} onOpenChange={setOpen}>
        <FloatingSheetContent>
          <div className="min-h-0 overflow-y-auto px-4 pb-4">
            <AccountSheet tile={tiles.find((t) => t.id === id)!} />
          </div>
        </FloatingSheetContent>
      </Drawer>
    </>
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
