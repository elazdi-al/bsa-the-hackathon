"use client";

import { cn } from "cn";
import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Drawer, FloatingSheetContent, FloatingSheetHeader } from "@/components/ui/drawer";
import { RowBody } from "../../history/_components/tx-row";
import { dayLabel, transactions } from "../../history/data";
import { hairline, sectionLabel } from "../../_components/list";
import { Money } from "../../_components/money";
import { useWallet } from "../../_components/wallet";
import { tiles, type Tile, type TileId } from "../data";
import { AssetTile } from "./asset-tile";
import { tileIcons } from "./icons";
import { PromoStack } from "./promo-stack";

/** The Home grid. Tiles without a screen of their own, and the Earn promo, open an account sheet in place. */
export function Accounts() {
  const wallet = useWallet();
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
      <section aria-label="Accounts" className="mt-3.5 grid auto-rows-[152px] grid-cols-2 gap-2.5 md:grid-cols-4 lg:mt-6 lg:grid-cols-2">
        {shown.map((tile, i) => (
          <AssetTile key={tile.id} tile={tile} index={i} onOpen={() => show(tile.id)} />
        ))}
        <PromoStack className="col-span-2 md:col-span-4 lg:col-span-2" onOpenAccount={show} />
      </section>

      <Drawer open={open} onOpenChange={setOpen}>
        <FloatingSheetContent>
          <div className="min-h-0 overflow-y-auto px-4 pb-2">
            <AccountSheet tile={shown.find((t) => t.id === id)!} />
          </div>
        </FloatingSheetContent>
      </Drawer>
    </>
  );
}

function AccountSheet({ tile }: { tile: Tile }) {
  const Icon = tileIcons[tile.id];
  const activity = transactions.filter((t) => t.account === tile.id).slice(0, 4);

  return (
    <>
      <FloatingSheetHeader
        icon={
          // The tile icon drawn at the 54px of the other sheet headers; it is vector, so scaling stays crisp.
          <span className="grid size-[54px] place-items-center">
            <span className="scale-[1.6875]">
              <Icon />
            </span>
          </span>
        }
        title={tile.label}
      >
        <p className="mt-1 text-[27.5px] leading-[34px] font-bold tracking-[-0.01em]">
          <Money value={tile.value} />
        </p>
        {"about" in tile && <p className="mt-1 font-medium text-pretty text-[#969696]">{tile.about}</p>}
      </FloatingSheetHeader>

      <section aria-label="Recent activity" className="mt-6">
        <h3 className={`px-3 ${sectionLabel}`}>Recent activity</h3>
        <ul className={`rounded-[18px] py-1 ${hairline}`}>
          {activity.map((t) => (
            <li key={t.id} className="flex min-h-[60px] items-center gap-3 px-3 py-2">
              <RowBody tx={t} when={dayLabel(t.date)} />
            </li>
          ))}
        </ul>
      </section>

      <Link
        href={`/history?account=${tile.id}`}
        transitionTypes={["tab-forward"]}
        // The ghost hover is the sheet's own grey; a black tint shows on it.
        className={cn(buttonVariants({ variant: "ghost" }), "mt-2 h-11 w-full text-[13.5px] hover:bg-black/[0.04]")}
      >
        See all activity
      </Link>
    </>
  );
}
