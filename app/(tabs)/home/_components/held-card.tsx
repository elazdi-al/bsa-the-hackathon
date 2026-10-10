"use client";

import { motion } from "motion/react";
import { useEffect, useReducer, useState, type Ref } from "react";
import { formatUnits } from "viem";
import { shortAddress } from "@/app/choose-recipient/data";
import { ClockIcon, FaceIdIcon, WarningIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, phone, type HeldPayment } from "@/lib/wallet/phone";
import { usd } from "../../_components/money";
import { blurred, easeOut, leave, sharp } from "../../_components/transitions";
import { chainNow, refreshWallet, type Wallet } from "../../_components/wallet";

const card = {
  initial: { opacity: 0, filter: blurred, y: 6 },
  animate: { opacity: 1, filter: sharp, y: 0, transition: { duration: 0.25, ease: easeOut } },
  exit: { opacity: 0, filter: blurred, y: -6, transition: leave },
};

/** What's left before a held payment leaves, in chain time, as a sentence. Re-renders when its words change. */
function useLeavesIn(wallet: Wallet, releaseAt: number) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const left = releaseAt - chainNow(wallet);
  useEffect(() => {
    if (left <= 0) return;
    // The words change on each whole minute left, and at zero.
    const id = setTimeout(tick, (left % 60) * 1000 + 50);
    return () => clearTimeout(id);
  });
  if (left <= 0) return "Leaving now.";
  if (left < 60) return "Leaves in under a minute.";
  const [h, m] = [Math.floor(left / 3600), Math.floor(left / 60) % 60];
  return `Leaves in ${[h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ")}. You can cancel until then.`;
}

/** A payment Swissquote holds before it leaves, or one its check at release stopped. Either way Face ID calls it off. */
export function HeldCard({ ref, payment, wallet }: { ref?: Ref<HTMLElement>; payment: HeldPayment; wallet: Wallet }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const leaves = useLeavesIn(wallet, payment.releaseAt);
  const stopped = payment.stopped !== null;
  const what = `${usd.format(Number(formatUnits(BigInt(payment.value), 6)))} to ${shortAddress(payment.to)}`;

  const cancel = async () => {
    setBusy(true);
    setFailed(false);
    // A 404 means it left already: the next read shows it in the balance.
    const ok = await phone.cancelPayment(payment.hash).then(
      () => true,
      (e: unknown) => e instanceof ApiError && e.status === 404,
    );
    if (ok) await refreshWallet();
    setBusy(false);
    setFailed(!ok);
  };

  return (
    <motion.section ref={ref} role={stopped ? "alert" : undefined} className="flex gap-3 rounded-[22px] bg-secondary p-4" {...card}>
      {stopped ? <WarningIcon className="shrink-0 text-pending" /> : <ClockIcon className="shrink-0 text-brand" />}
      <div className="min-w-0 flex-1">
        <h2 className="text-label">{stopped ? "Swissquote stopped a payment" : what}</h2>
        <p className="mt-1 text-body text-pretty text-muted-foreground tabular-nums">{stopped ? `${what} didn't leave. ${payment.stopped}` : leaves}</p>
        {failed && <p className="mt-2 text-caption text-negative">The payment wasn&apos;t {stopped ? "dismissed" : "cancelled"}. Try again.</p>}
        <Button size="sm" onClick={cancel} disabled={busy} aria-busy={busy} className="mt-3">
          {busy ? <Spinner aria-hidden /> : <FaceIdIcon size={16} />}
          {stopped ? "Dismiss" : "Cancel payment"}
        </Button>
      </div>
    </motion.section>
  );
}
