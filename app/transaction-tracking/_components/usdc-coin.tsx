import { BankIcon, type Icon } from "@phosphor-icons/react";

/** USDC coin with a badge: the bank marks a bank payout. */
export function UsdcCoin({ Badge = BankIcon }: { Badge?: Icon }) {
  return (
    <div className="relative size-[54px]">
      <svg viewBox="0 0 32 32" aria-hidden className="size-full">
        <circle cx="16" cy="16" r="16" fill="#2775ca" />
        <g fill="none" stroke="#fff" strokeLinecap="round">
          <path d="M11.24 9.2A8.3 8.3 0 0 0 11.24 22.8M20.76 9.2A8.3 8.3 0 0 1 20.76 22.8" strokeWidth="2.2" />
          <path
            d="M18.7 13.6c-.3-1.2-1.3-2-2.7-2-1.5 0-2.6.8-2.6 2 0 1.3 1 1.8 2.6 2.1 1.7.3 2.8.9 2.8 2.2 0 1.3-1.1 2.1-2.8 2.1-1.5 0-2.5-.8-2.8-2M16 9.8v1.8M16 20v1.9"
            strokeWidth="1.9"
          />
        </g>
      </svg>
      <span className="absolute -top-[3px] left-[36px] grid size-[21px] place-items-center rounded-full bg-[#e6e6e8] text-black ring-3 ring-[#f2f2f2]">
        <Badge size={12} weight="fill" />
      </span>
    </div>
  );
}
