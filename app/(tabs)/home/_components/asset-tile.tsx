import Link from "next/link";
import { CardIcon, ChartIcon, CoinIcon, PercentIcon, type Icon } from "@/components/icons";
import type { Tile, TileId } from "../data";
import { BlurMoney } from "./blur-money";

/**
 * Each account's colour and glyph, shared by its tile and its sheet so the sheet reads as the tile opened.
 * The colours are the ones its money wears elsewhere: cash is green like money coming in, investments blue
 * like a swap, earn orange like a reward. Each block is lit from above, lighter and warmer at the top, and
 * settles on its base by the label so white text keeps its contrast.
 */
export const tileLooks: Record<TileId, { Icon: Icon; fill: string }> = {
  cash: { Icon: CoinIcon, fill: "bg-linear-to-b/oklch from-[oklch(0.75_0.17_140)] to-[oklch(0.62_0.16_152)] to-70%" },
  investments: { Icon: ChartIcon, fill: "bg-linear-to-b/oklch from-[oklch(0.65_0.17_248)] to-brand to-70%" },
  earn: { Icon: PercentIcon, fill: "bg-linear-to-b/oklch from-[oklch(0.79_0.16_70)] to-[oklch(0.66_0.185_44)] to-70%" },
  card: { Icon: CardIcon, fill: "bg-linear-to-b/oklch from-[oklch(0.38_0.01_286)] to-ink to-70%" },
};

export function AssetTile({ tile, index, onOpen }: { tile: Tile; index: number; onOpen: () => void }) {
  const { Icon, fill } = tileLooks[tile.id];
  const body = (
    <>
      <Icon size={32} />
      <span className="mt-auto pt-2 text-label">{tile.label}</span>
      <span className="text-heading max-[375px]:text-label max-[375px]:font-bold">
        <BlurMoney value={tile.value} delay={0.05 + index * 0.08} step={0.035} />
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
