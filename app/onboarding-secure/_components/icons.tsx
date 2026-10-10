import { CloudIcon, EnvelopeIcon } from "@phosphor-icons/react";
import type { KeyId } from "../data";

/** Apple's Face ID mark, which Phosphor does not ship. */
export function FaceIdGlyph({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3 8V6.5A3.5 3.5 0 0 1 6.5 3H8M16 3h1.5A3.5 3.5 0 0 1 21 6.5V8M21 16v1.5a3.5 3.5 0 0 1-3.5 3.5H16M8 21H6.5A3.5 3.5 0 0 1 3 17.5V16" />
      <path d="M8.5 8.75v1.5M15.5 8.75v1.5M12.25 8.75v4.25h-1M8.9 15.6c1.75 1.45 4.45 1.45 6.2 0" />
    </svg>
  );
}

export function KeyIcon({ id, size, className }: { id: KeyId; size: number; className?: string }) {
  if (id === "device") return <FaceIdGlyph size={size} className={className} />;
  const Icon = id === "twofa" ? CloudIcon : EnvelopeIcon;
  return <Icon size={size} weight="fill" className={className} aria-hidden />;
}

export function Spinner({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className="animate-spin" aria-hidden>
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.25" />
      <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}
