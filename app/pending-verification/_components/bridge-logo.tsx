export function BridgeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <circle cx="12" cy="12" r="12" />
      <g fill="none" stroke="#fff" strokeWidth="1.6">
        <path d="M6.4 12.5a5.6 5.6 0 0 1 11.2 0" />
        <path d="M6.74 14.42a5.6 5.6 0 0 0 10.52 0" strokeDasharray="0.9 0.93" />
      </g>
    </svg>
  );
}
