import Link from "next/link";
import { BankIcon, CardIcon, ChartIcon, CoinIcon, CoinsIcon, LockIcon, PercentIcon, type Icon } from "@/components/icons";
import { DemoTag } from "@/components/ui/demo-tag";
import type { Tile, TileId } from "../data";
import { IntroMoney } from "./blur-money";

/**
 * Each account's colour and glyph, shared by its tile and its sheet so the sheet reads as the tile opened.
 * The colours are the ones its money wears elsewhere: cash is green like money coming in, investments blue
 * like a swap, earn orange like a reward, staking purple and borrowing teal. Each block is lit from above,
 * lighter and warmer at the top, and settles on its base by the label so white text keeps its contrast.
 */
export const tileLooks: Record<TileId, { Icon: Icon; fill: string }> = {
  cash: { Icon: CoinIcon, fill: "bg-linear-to-b/oklch from-[oklch(0.75_0.17_140)] to-[oklch(0.62_0.16_152)] to-70%" },
  investments: { Icon: ChartIcon, fill: "bg-linear-to-b/oklch from-[oklch(0.65_0.17_248)] to-brand to-70%" },
  earn: { Icon: PercentIcon, fill: "bg-linear-to-b/oklch from-[oklch(0.79_0.16_70)] to-[oklch(0.66_0.185_44)] to-70%" },
  card: { Icon: CardIcon, fill: "bg-linear-to-b/oklch from-[oklch(0.38_0.01_286)] to-ink to-70%" },
  staking: { Icon: CoinsIcon, fill: "bg-linear-to-b/oklch from-[oklch(0.7_0.17_310)] to-purple to-70%" },
  borrowing: { Icon: BankIcon, fill: "bg-linear-to-b/oklch from-[oklch(0.76_0.12_185)] to-[oklch(0.6_0.11_200)] to-70%" },
};

/** A locked tile, a Swissquote service the wallet isn't linked for, is grey: its colour comes with the link. */
export const lockedFill = "bg-secondary text-muted-foreground";

export function AssetTile({ tile, index, locked, onOpen }: { tile: Tile; index: number; locked: boolean; onOpen: () => void }) {
  const { Icon, fill } = tileLooks[tile.id];
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <Icon size={32} className={locked ? "text-faint" : undefined} />
        {locked ? <LockIcon size={20} className="text-faint" /> : tile.demo && <DemoTag className="bg-white/20 text-white" />}
      </span>
      <span className="mt-auto pt-2 text-label">
        {tile.label}
        {locked && <span className="sr-only">, locked</span>}
      </span>
      <span className="text-heading max-[375px]:text-label max-[375px]:font-bold">
        <IntroMoney value={tile.value} delay={0.05 + index * 0.08} step={0.035} />
      </span>
    </>
  );
  const className = `flex min-h-28 flex-col rounded-[22px] p-4 text-left outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.96] ${locked ? lockedFill : `text-white ${fill}`}`;

  // A locked tile with a screen of its own opens its sheet instead, which says how to unlock it.
  return "href" in tile && !locked ? (
    <Link href={tile.href} transitionTypes={["push"]} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" aria-haspopup="dialog" onClick={onOpen} className={className}>
      {body}
    </button>
  );
}
