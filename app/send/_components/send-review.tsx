"use client";

import { MotionConfig } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { encodeFunctionData, erc20Abi, parseUnits, type Address, type Hex } from "viem";
import { sendDraft } from "@/app/choose-recipient/data";
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

/** Continue asks Swissquote to sponsor the transfer; Send is Face ID approving exactly that operation. */
export function SendReview({ to, address, usdc, children }: { to: string; address: Address; usdc: Address; children: ReactNode }) {
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
          to: usdc,
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
            className="bg-transparent caret-brand outline-none"
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
