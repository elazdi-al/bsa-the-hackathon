"use client";

import { MotionConfig } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { encodeFunctionData, erc20Abi, parseUnits, type Address, type Hex } from "viem";
import { recipientFor, sendDraft } from "@/app/choose-recipient/data";
import { WalletIcon } from "@/components/icons";
import { ApiError, phone, type Prepared } from "@/lib/wallet/phone";
import { SendButton, type Phase } from "./send-button";

const AMOUNT = /^\d+(\.\d{0,6})?$/;
const SENT_MS = 700;

/** Swissquote's refusal and its reasons, or the error as is. */
function failure(e: unknown): string[] {
  if (!(e instanceof ApiError)) return [(e as Error).message];
  const decision = e.body.decision as { reasons?: string[] } | undefined;
  return [e.message, ...(decision?.reasons ?? [])];
}

export function SendReview({ children }: { children: ReactNode }) {
  const to = useSearchParams().get("to");
  const shown = to === null ? null : recipientFor(to);
  const router = useRouter();

  useEffect(() => {
    if (!shown) router.replace("/choose-recipient");
  }, [shown, router]);

  if (to === null || !shown) return null;
  return (
    <Review to={to} address={shown.address as Address}>
      <section aria-label="Recipient" className="flex items-center gap-4">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-[22px] text-muted-foreground">
          <WalletIcon />
        </span>
        <p className="min-w-0 flex-1">
          <span className="block truncate text-label">{shown.name}</span>
          <span className="block truncate text-body text-muted-foreground">{shown.detail}</span>
        </p>
      </section>
      {children}
    </Review>
  );
}

/** Continue asks Swissquote to sponsor the transfer; Send is Face ID approving exactly that operation. */
function Review({ to, address, children }: { to: string; address: Address; children: ReactNode }) {
  const router = useRouter();
  const [amount, setAmount] = useState("25");
  const [phase, setPhase] = useState<Phase>("review");
  const [prepared, setPrepared] = useState<Prepared>();
  const [sent, setSent] = useState<Hex>();
  const [error, setError] = useState<string[]>([]);

  useEffect(() => sendDraft.set(to), [to]);

  useEffect(() => {
    if (!sent) return;
    const id = setTimeout(() => {
      sendDraft.clear();
      // Replace, so Back from the tracker can't land on a review that's already sent.
      router.replace(`/transaction-tracking?${new URLSearchParams({ hash: sent, amount, to: address })}`, {
        transitionTypes: ["push"],
      });
    }, SENT_MS);
    return () => clearTimeout(id);
  }, [sent, amount, address, router]);

  const valid = AMOUNT.test(amount) && Number(amount) > 0;

  function reset() {
    setPhase("review");
    setPrepared(undefined);
    setError([]);
  }

  async function check() {
    setPhase("checking");
    setError([]);
    try {
      setPrepared(
        await phone.prepare({
          to: (await phone.config()).usdc,
          data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [address, parseUnits(amount, 6)] }),
        }),
      );
      setPhase("confirm");
    } catch (e) {
      setPhase("review");
      setError(failure(e));
    }
  }

  async function send() {
    setPhase("sending");
    try {
      setSent(await phone.approve(prepared!));
      setPhase("sent");
    } catch (e) {
      // Start over with a fresh operation: Swissquote's sponsorship of this one expires within minutes.
      reset();
      setError(failure(e));
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="pt-16 pb-20 text-center md:pt-0">
        <label className="flex items-baseline justify-center text-display tabular-nums">
          <span aria-hidden>$</span>
          <input
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(",", "."));
              reset();
            }}
            readOnly={phase === "checking" || phase === "sending" || phase === "sent"}
            inputMode="decimal"
            aria-label="Amount in USDC"
            style={{ width: `${Math.max(amount.length, 1)}ch` }}
            className="bg-transparent caret-fuse-blue outline-none"
          />
        </label>
        <p className="mt-2 text-body text-muted-foreground tabular-nums">
          {valid ? Number(amount).toLocaleString("en-US", { maximumFractionDigits: 6 }) : 0} USDC
        </p>
      </div>

      {children}

      <div className="mt-auto pt-10 md:mt-0">
        {error.length > 0 && (
          <div role="alert" className="mb-3 text-center text-caption text-negative">
            {error.map((line) => (
              <p key={line} className="first-letter:uppercase">
                {line}
              </p>
            ))}
          </div>
        )}
        <SendButton phase={phase} disabled={!valid} onPress={phase === "confirm" ? send : check} />
      </div>
    </MotionConfig>
  );
}
