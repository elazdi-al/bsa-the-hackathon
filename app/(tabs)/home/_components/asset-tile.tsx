import Link from "next/link";
import { CardIcon, ChartIcon, CoinIcon, PercentIcon, type Icon } from "@/components/icons";
import type { Tile, TileId } from "../data";
import { BlurMoney } from "./blur-money";

/** Each account's colour and glyph, shared by its tile and its sheet so the sheet reads as the tile opened. */
export const tileLooks: Record<TileId, { Icon: Icon; fill: string }> = {
  cash: { Icon: CoinIcon, fill: "bg-fuse-blue" },
  investments: { Icon: ChartIcon, fill: "bg-orange" },
  earn: { Icon: PercentIcon, fill: "bg-purple" },
  card: { Icon: CardIcon, fill: "bg-ink" },
};

export function AssetTile({ tile, index, onOpen }: { tile: Tile; index: number; onOpen: () => void }) {
  const { Icon, fill } = tileLooks[tile.id];
  const body = (
    <>
      <Icon size={32} />
      <span className="mt-auto pt-2 text-label">{tile.label}</span>
      <span className="text-heading max-[375px]:text-label max-[375px]:font-bold">
        <BlurMoney value={tile.value} delay={0.05 + index * 0.08} step={0.035} centsClassName="text-white/60" />
      </span>
    </>
  );
  const className = `flex min-h-28 flex-col rounded-[22px] p-4 text-left text-white outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.96] ${fill}`;

  return "href" in tile ? (
    <Link href={tile.href} transitionTypes={["push"]} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" aria-haspopup="dialog" onClick={onOpen} className={className}>
      {body}
    </button>
  );
}
