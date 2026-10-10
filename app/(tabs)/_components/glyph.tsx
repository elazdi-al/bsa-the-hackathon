import type { Icon, IconWeight } from "@phosphor-icons/react";

/** The ink of black glyphs (card, membership). */
export const ink = "#1f1f1f";

/**
 * The round glyph of list rows (40px) and sheet headers (54px): the icon in its colour on a 12% tint of it.
 * Ink takes a 6% grey instead, since 12% of near-black reads darker than the pastel tints beside it.
 */
export function Glyph({ Icon, color, size = 40, weight = "fill" }: { Icon: Icon; color: string; size?: number; weight?: IconWeight }) {
  return (
    <span
      aria-hidden
      style={{ color, width: size, height: size }}
      className={`grid shrink-0 place-items-center rounded-full ${color === ink ? "bg-black/[0.06]" : "bg-current/12"}`}
    >
      <Icon weight={weight} size={size / 2} />
    </span>
  );
}
