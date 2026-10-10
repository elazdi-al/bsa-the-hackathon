import type { SVGProps } from "react";

// SF Symbols' shield.lefthalf.filled, which Phosphor has no match for.
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
