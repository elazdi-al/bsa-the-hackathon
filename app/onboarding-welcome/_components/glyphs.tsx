import type { SVGProps } from "react";

type GlyphProps = SVGProps<SVGSVGElement>;

export function FuseLogo(props: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M5.5 5.5H18.5M5.5 5.5V18.5" stroke="currentColor" strokeWidth={3.2} />
      <circle cx={5.5} cy={5.5} r={4} />
      <circle cx={18.5} cy={5.5} r={3.4} />
      <circle cx={5.5} cy={18.5} r={3.6} />
      <circle cx={18.5} cy={18.5} r={3.2} />
    </svg>
  );
}
