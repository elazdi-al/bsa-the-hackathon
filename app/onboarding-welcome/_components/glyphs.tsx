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

/** Apple's Face ID mark: corner brackets around a face. */
export function FaceIdGlyph(props: GlyphProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M4 20v-8a8 8 0 0 1 8-8h8M44 4h8a8 8 0 0 1 8 8v8M60 44v8a8 8 0 0 1-8 8h-8M20 60h-8a8 8 0 0 1-8-8v-8" />
      <path d="M22 22v5M42 22v5M32 22v12h-3M23 43q9 7 18 0" />
    </svg>
  );
}

/** Face ID success: the face inside a closed ring. */
export function FaceMatchGlyph(props: GlyphProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx={32} cy={32} r={28} />
      <path d="M24 25v5M40 25v5M32 26v10h-3M23 42q9 7 18 0" />
    </svg>
  );
}

/** Illustrated stand-in for the Apple Account photo. */
export function AccountAvatar(props: GlyphProps) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden {...props}>
      <rect width={40} height={40} fill="#D6D6DB" />
      <path d="M5 40c1.5-8 7.5-11.5 15-11.5S33.5 32 35 40Z" fill="#EBCBD5" />
      <path d="M14.5 29.5 20 35l5.5-5.5" fill="none" stroke="#2B2B30" strokeWidth={2} />
      <rect x={17} y={23} width={6} height={7} fill="#BD8B70" />
      <ellipse cx={20} cy={19.5} rx={7} ry={8} fill="#D6A383" />
      <path d="M13 20c0 6 3 9.5 7 9.5s7-3.5 7-9.5c-1 2-3 3-7 3s-6-1-7-3Z" fill="#5A4234" />
      <path d="M12.5 15.5c0-6.5 3.5-10 7.5-10s7.5 3.5 7.5 10Z" fill="#B42B3F" />
      <rect x={12} y={13.5} width={16} height={3.5} rx={1.75} fill="#97202F" />
    </svg>
  );
}
