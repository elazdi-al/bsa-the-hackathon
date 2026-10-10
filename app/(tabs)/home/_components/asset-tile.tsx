import Link from "next/link";
import type { Tile } from "../data";
import { BlurMoney } from "./blur-money";
import { tileIcons } from "./icons";

export const tileSurface = "rounded-[22px] border border-black/[0.035] bg-surface";

export function AssetTile({ tile, index }: { tile: Tile; index: number }) {
  const Icon = tileIcons[tile.id];
  const body = (
    <>
      <Icon />
      <span className="mt-auto text-[14px] leading-[18px] text-[#adadad]">{tile.label}</span>
      <span className="mt-1 text-[18px] leading-[22px] font-bold tracking-[-0.01em] max-[375px]:text-[16px]">
        <BlurMoney value={tile.value} delay={0.05 + index * 0.08} step={0.035} />
      </span>
    </>
  );
  const className = `flex flex-col p-5 max-[375px]:p-4 ${tileSurface}`;

  return tile.href ? (
    <Link
      href={tile.href}
      transitionTypes={["push"]}
      className={`${className} outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-black/20 active:scale-[0.96]`}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
