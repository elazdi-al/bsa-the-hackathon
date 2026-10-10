import type { SVGProps } from "react";

// SF Symbols glyphs Phosphor has no match for: shield.lefthalf.filled and faceid.

export function ShieldLeftHalf(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 24" fill="currentColor" aria-hidden {...props}>
      <path d="M10 1.8C7.4 2.9 4.8 3.6 2.4 3.9 2.1 3.95 1.9 4.2 1.9 4.5v6.7c0 5 3.2 8.8 7.7 10.8.13.06.27.08.4.08z" />
      <path
        d="M10 1.8c2.6 1.1 5.2 1.8 7.6 2.1.3.05.5.3.5.6v6.7c0 5-3.2 8.8-7.7 10.8a1 1 0 0 1-.8 0C5.1 20 1.9 16.2 1.9 11.2V4.5c0-.3.2-.55.5-.6C4.8 3.6 7.4 2.9 10 1.8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FaceId(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M2 7.5V6a4 4 0 0 1 4-4h1.5M16.5 2H18a4 4 0 0 1 4 4v1.5M22 16.5V18a4 4 0 0 1-4 4h-1.5M7.5 22H6a4 4 0 0 1-4-4v-1.5" />
      <path d="M8.2 8.5v1.6M15.8 8.5v1.6M12.2 8.5v4.6h-1M8.6 16c2 1.7 4.8 1.7 6.8 0" />
    </svg>
  );
}
