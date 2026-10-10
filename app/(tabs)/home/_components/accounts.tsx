"use client";

import {
  ArrowDownIcon,
  ArrowsClockwiseIcon,
  BankIcon,
  CreditCardIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  SparkleIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Drawer, FloatingSheetContent, FloatingSheetHeader } from "@/components/ui/drawer";
import { Money } from "../../_components/money";
import { dayLabel, tiles, transactions, type Kind, type Tile, type TileId } from "../data";
import { AssetTile } from "./asset-tile";
import { tileIcons } from "./icons";
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
      <section aria-label="Accounts" className="mt-3.5 grid auto-rows-[152px] grid-cols-2 gap-2.5 md:grid-cols-4 lg:mt-6 lg:grid-cols-2">
        {tiles.map((tile, i) => (
          <AssetTile key={tile.id} tile={tile} index={i} onOpen={() => show(tile.id)} />
        ))}
        <PromoStack className="col-span-2 md:col-span-4 lg:col-span-2" onOpenAccount={show} />
      </section>

      <Drawer open={open} onOpenChange={setOpen}>
        <FloatingSheetContent>
          <div className="min-h-0 overflow-y-auto px-4 pb-2">
            <AccountSheet tile={tiles.find((t) => t.id === id)!} />
          </div>
        </FloatingSheetContent>
      </Drawer>
    </>
  );
}

// One scheme: a coloured glyph on a circle tinted with the same colour.
const kinds: Record<Kind, { Icon: Icon; glyph: string; tint: string }> = {
  receive: { Icon: ArrowDownIcon, glyph: "text-[#ef642c]", tint: "bg-[#ef642c]/12" },
  send: { Icon: PaperPlaneTiltIcon, glyph: "text-[#8a52f5]", tint: "bg-[#8a52f5]/12" },
  withdrawal: { Icon: BankIcon, glyph: "text-[#8a52f5]", tint: "bg-[#8a52f5]/12" },
  swap: { Icon: ArrowsClockwiseIcon, glyph: "text-[#2059f2]", tint: "bg-[#2059f2]/12" },
  reward: { Icon: SparkleIcon, glyph: "text-positive", tint: "bg-positive/12" },
  deposit: { Icon: BankIcon, glyph: "text-[#ef642c]", tint: "bg-[#ef642c]/12" },
  card: { Icon: CreditCardIcon, glyph: "text-[#1f1f1f]", tint: "bg-black/[0.06]" },
  membership: { Icon: PlusIcon, glyph: "text-[#1f1f1f]", tint: "bg-black/[0.06]" },
};

const sign = { in: "+", out: "−", swap: "" } as const;

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
        <h3 className="px-4 pb-1 font-medium text-[#a5a5a5]">Recent activity</h3>
        <ul className="rounded-[18px] py-1 shadow-[0_0_0_1px_rgb(0_0_0/0.035),0_2px_6px_rgb(0_0_0/0.02)]">
          {activity.map((t) => {
            const { Icon: Glyph, glyph, tint } = kinds[t.kind];
            return (
              <li key={t.id} className="flex min-h-[60px] items-center gap-3 px-3 py-2">
                <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-full ${tint} ${glyph}`}>
                  <Glyph weight={t.kind === "receive" ? "bold" : "fill"} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] leading-5 font-medium">{t.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[13px] leading-[18px] text-[#adadad]">
                    <span className="truncate">
                      {dayLabel(t.date)} · {t.detail}
                    </span>
                    {t.status === "Pending" && (
                      <span className="shrink-0 rounded-full bg-pending/12 px-1.5 py-px text-[11px] font-medium text-pending">Pending</span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-[15px] leading-5 font-medium ${t.flow === "in" ? "text-positive" : ""}`}>
                    {sign[t.flow]}
                    <Money value={t.usd} />
                  </span>
                  {t.crypto && <span className="mt-0.5 block text-[13px] leading-[18px] text-[#adadad] tabular-nums">{t.crypto}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* No activity screen yet. */}
      <button type="button" disabled className={buttonVariants({ variant: "ghost", className: "mt-2 h-11 w-full text-[13.5px]" })}>
        See all activity
      </button>
    </>
  );
}
