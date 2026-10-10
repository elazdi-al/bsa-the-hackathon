"use client";

import { CheckCircleIcon, ProhibitIcon, UserFocusIcon } from "@phosphor-icons/react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { encodeFunctionData, erc20Abi, parseUnits, type Address } from "viem";
import { sendDraft } from "@/app/choose-recipient/data";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { api, ApiError, approve, mockSelfie } from "@/lib/wallet/browser";
import type { Prepared } from "@/lib/wallet/client";
import { blurSwap } from "./motion";
import { SendButton, type Phase } from "./send-button";

type Decision = { tier: "standard" | "confirm" | "high" | "blocked"; summary: string[]; reasons: string[] };
type StepUp = { pin?: string; selfie?: string };

const AMOUNT = /^\d+(\.\d{0,6})?$/;
const SENT_MS = 700;
const card = "mt-6 rounded-[18px] p-4 text-[14px] leading-[19px] tracking-[-0.15px] [overflow-wrap:anywhere]";

/**
 * Swissquote's policy reviews the payment first: its plain-language summary is what Face ID then approves.
 * Larger payments ask for the PIN (and a selfie) before Swissquote will sponsor and co-sign them.
 */
export function SendReview({ to, address, usdc, children }: { to: string; address: Address; usdc: Address; children: ReactNode }) {
  const router = useRouter();
  const [amount, setAmount] = useState("25");
  const [phase, setPhase] = useState<Phase>("review");
  const [decision, setDecision] = useState<Decision>();
  const [needs, setNeeds] = useState<("pin" | "selfie")[]>([]);
  const [stepUp, setStepUp] = useState<StepUp>({});
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
  const blocked = decision?.tier === "blocked";
  const stepUpReady = (!needs.includes("pin") || stepUp.pin?.length === 4) && (!needs.includes("selfie") || !!stepUp.selfie);

  function reset() {
    setPhase("review");
    setDecision(undefined);
    setNeeds([]);
    setStepUp({});
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
      const op = await api<Prepared & { decision: Decision }>("POST", "/api/wallet/operations", {
        calls: [call],
        stepUp: needs.length ? stepUp : undefined,
      });
      setDecision(op.decision);
      setPrepared(op);
      setNeeds([]);
      setPhase("confirm");
    } catch (e) {
      const body = e instanceof ApiError ? e.body : {};
      setPhase("review");
      if (body.decision) setDecision(body.decision);
      if (body.stepUp) {
        if (needs.length) setError("That didn't match. Check your PIN and try again.");
        setNeeds(body.stepUp);
        setStepUp({});
      } else if (!body.decision) setError((e as Error).message);
    }
  }

  async function send() {
    setPhase("sending");
    try {
      await approve(prepared!);
      setPhase("sent");
    } catch (e) {
      // Start over with a fresh check: Swissquote's sponsorship of this operation expires within minutes.
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

      <AnimatePresence mode="popLayout" initial={false}>
        {decision?.tier === "blocked" ? (
          <motion.div key="blocked" {...blurSwap} className={`${card} bg-negative/[0.06]`}>
            <p className="flex items-center gap-2 font-semibold text-negative">
              <ProhibitIcon weight="bold" size={17} aria-hidden />
              We can&apos;t co-sign this payment
            </p>
            <ul className="mt-1.5 text-black/50">
              {decision.reasons.map((reason) => (
                <li key={reason} className="first-letter:uppercase">
                  {reason}.
                </li>
              ))}
            </ul>
          </motion.div>
        ) : needs.length ? (
          <motion.div key="step-up" {...blurSwap} className={`${card} shadow-[0_0_0_1px_rgb(0_0_0/0.06)]`}>
            <p className="font-semibold">This is a larger payment</p>
            <p className="mt-0.5 text-black/40">
              Confirm it with your Swissquote PIN{needs.includes("selfie") ? " and a selfie" : ""}.
            </p>
            <InputOTP
              maxLength={4}
              pattern={REGEXP_ONLY_DIGITS}
              value={stepUp.pin ?? ""}
              onChange={(pin) => setStepUp((s) => ({ ...s, pin }))}
              aria-label="Swissquote PIN"
              containerClassName="mt-3"
            >
              <InputOTPGroup>
                {[0, 1, 2, 3].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {needs.includes("selfie") && (
              <Button variant="secondary" size="sm" className="mt-3 gap-1.5" onClick={() => setStepUp((s) => ({ ...s, selfie: mockSelfie() }))}>
                <UserFocusIcon weight="fill" size={15} aria-hidden />
                {stepUp.selfie ? "Selfie taken" : "Take selfie"}
              </Button>
            )}
            <p className="mt-3 text-[12px] text-black/35">Mocked: the demo PIN is 1234, and the selfie matches your KYC photo.</p>
          </motion.div>
        ) : decision ? (
          <motion.ul key="summary" {...blurSwap} aria-label="Summary" className={`${card} flex flex-col gap-2 shadow-[0_0_0_1px_rgb(0_0_0/0.06)]`}>
            {decision.summary.map((line) => (
              <li key={line} className="flex gap-2">
                <CheckCircleIcon weight="fill" size={17} aria-hidden className="mt-px shrink-0 text-positive" />
                {line}
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>

      <div className="mt-auto pt-10 md:mt-0">
        <p aria-live="polite" className="mb-3 text-center text-[13px] leading-[18px] text-negative first-letter:uppercase empty:hidden">
          {error}
        </p>
        <SendButton
          phase={phase}
          disabled={!valid || blocked || !stepUpReady}
          onPress={phase === "confirm" ? send : check}
        />
      </div>
    </MotionConfig>
  );
}
