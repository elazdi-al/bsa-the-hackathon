import { CheckCircleIcon, ClockIcon, CopyIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { BackButton } from "@/components/ui/back-button";
import { wallet } from "../data";

const short = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;
// The app's icon swap, as in the Receive sheet.
const iconHidden = { opacity: 0, scale: 0.25, filter: "blur(4px)" };
const iconSwap = { type: "spring", duration: 0.3, bounce: 0 } as const;

export function WalletHeader() {
  return (
    <header className="flex items-center gap-4 px-[22px]">
      <BackButton fallback="/home" className="-mr-1" />
      <span aria-hidden className="grid size-[42px] shrink-0 place-items-center rounded-full bg-[#e6e6e6]">
        <FuseMark />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-[17px]/[22px] font-semibold tracking-[-0.01em]">{wallet.name}</h1>
        <CopyAddress />
      </div>
      {/* No History screen yet. */}
      <button
        type="button"
        disabled
        aria-label="History"
        className="-mr-2.5 grid size-11 place-items-center rounded-full text-[#b7b7b7] outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-black/20 active:scale-[0.96]"
      >
        <ClockIcon weight="fill" mirrored className="size-6" />
      </button>
    </header>
  );
}

function CopyAddress() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = () =>
    navigator.clipboard?.writeText(wallet.address).then(
      () => setCopied(true),
      () => {}, // Clipboard blocked: no feedback to give.
    );

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy address ${wallet.address}`}
        className="relative -my-1 -mt-px flex items-center gap-1.5 py-1 text-[15px]/5 rounded-sm text-[#8a8a8a] outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-black/20 active:scale-[0.96]"
      >
        {short(wallet.address)}
        <span className="grid size-4 place-items-center">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={copied ? "check" : "copy"}
              initial={iconHidden}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={iconHidden}
              transition={iconSwap}
            >
              {copied ? (
                <CheckCircleIcon weight="fill" className="size-4 text-positive" />
              ) : (
                <CopyIcon weight="duotone" className="size-4" />
              )}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>
      <span role="status" className="sr-only">
        {copied ? "Address copied" : ""}
      </span>
    </>
  );
}

function FuseMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-[15px] text-[#b2b2b2]">
      <g fill="currentColor">
        <circle cx="4.5" cy="4.5" r="3.8" />
        <circle cx="4.5" cy="19" r="4.3" />
        <circle cx="20.5" cy="4.5" r="3" />
        <circle cx="20.7" cy="19.7" r="3.2" />
      </g>
      <path d="M4.5 4.5V19M4.5 4.5h16" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}
