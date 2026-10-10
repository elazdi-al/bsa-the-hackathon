"use client";

import { MotionConfig } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { encodeFunctionData, erc20Abi, parseUnits, type Address } from "viem";
import { sendDraft } from "@/app/choose-recipient/data";
import { api, approve } from "@/lib/wallet/browser";
import type { Prepared } from "@/lib/wallet/client";
import { SendButton, type Phase } from "./send-button";

const AMOUNT = /^\d+(\.\d{0,6})?$/;
const SENT_MS = 700;

/** Continue prepares the sponsored operation; Send is Face ID approving exactly that operation. */
export function SendReview({ to, address, usdc, children }: { to: string; address: Address; usdc: Address; children: ReactNode }) {
  const router = useRouter();
  const [amount, setAmount] = useState("25");
  const [phase, setPhase] = useState<Phase>("review");
  const [prepared, setPrepared] = useState<Prepared>();
  const [error, setError] = useState("");

  useEffect(() => sendDraft.set(to), [to]);

  useEffect(() => {
    if (phase !== "sent" || !prepared) return;
    const id = setTimeout(() => {
      sendDraft.clear();
      // Replace, so Back from the tracker can't land on a review that's already sent.
      router.replace(`/transaction-tracking?${new URLSearchParams({ hash: prepared.hash, amount, to: address })}`, {
        transitionTypes: ["push"],
      });
    }, SENT_MS);
    return () => clearTimeout(id);
  }, [phase, prepared, amount, address, router]);

  const valid = AMOUNT.test(amount) && Number(amount) > 0;

  function reset() {
    setPhase("review");
    setPrepared(undefined);
    setError("");
  }

  async function check() {
    setPhase("checking");
    setError("");
    const call = {
      to: usdc,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [address, parseUnits(amount, 6)] }),
    };
    try {
      setPrepared(await api<Prepared>("POST", "/api/wallet/operations", { call }));
      setPhase("confirm");
    } catch (e) {
      setPhase("review");
      setError((e as Error).message);
    }
  }

  async function send() {
    setPhase("sending");
    try {
      await approve(prepared!);
      setPhase("sent");
    } catch (e) {
      // Start over with a fresh operation: Swissquote's sponsorship of this one expires within minutes.
      reset();
      setError((e as Error).message);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="pt-16 pb-[84px] text-center md:pt-0">
        <label className="flex items-baseline justify-center text-[48px] leading-[56px] font-bold tracking-[-0.035em] tabular-nums">
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
        <p className="mt-1 text-[15px] text-black/35 tabular-nums">{valid ? Number(amount).toLocaleString("en-US", { maximumFractionDigits: 6 }) : 0} USDC</p>
      </div>

      {children}

      <div className="mt-auto pt-10 md:mt-0">
        <p aria-live="polite" className="mb-3 text-center text-[13px] leading-[18px] text-negative first-letter:uppercase empty:hidden">
          {error}
        </p>
        <SendButton
          phase={phase}
          disabled={!valid}
          onPress={phase === "confirm" ? send : check}
        />
      </div>
    </MotionConfig>
  );
}
