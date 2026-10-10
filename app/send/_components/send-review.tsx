"use client";

import { MotionConfig } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { encodeFunctionData, erc20Abi, parseUnits, type Address, type Hex } from "viem";
import { usd } from "@/app/(tabs)/_components/money";
import { refreshWallet, useWallet, type WalletSnapshot } from "@/app/(tabs)/_components/wallet";
import { sendDraft } from "@/app/choose-recipient/data";
import { ApiError, phone, type Prepared } from "@/lib/wallet/phone";
import { SendButton, type Phase } from "./send-button";

const AMOUNT = /^\d+(\.\d{0,6})?$/;
const SENT_MS = 700;

/** Why this phone can't send yet, by wallet status. */
const UNAVAILABLE: Record<Exclude<WalletSnapshot["status"], "ready">, string> = {
  loading: "",
  none: "This phone has no wallet yet.",
  missing: "Swissquote can't find this wallet.",
  offline: "Can't reach Swissquote. Check your connection.",
};

/** What stops Continue and Send, as a calm line; "" holds them without a word while the wallet loads, undefined lets them run. */
function blocker(snapshot: WalletSnapshot, amount: number): string | undefined {
  if (snapshot.status !== "ready") return UNAVAILABLE[snapshot.status];
  const { controls, recovery, usdc } = snapshot.wallet;
  if (!controls) {
    return recovery?.mine ? "You can send once your wallet is restored on this phone." : "Your wallet moved to another phone, so this one can't send from it.";
  }
  if (amount > usdc) return `You have ${usd.format(usdc)}.`;
}

/** Swissquote's refusal and its reasons, a known failure in plain words, or the error as is. */
function failure(e: unknown): string[] {
  // fetch rejects with a TypeError when no response came back: "Failed to fetch", "Load failed", "NetworkError...".
  if (e instanceof TypeError && /fetch|load failed|network/i.test(e.message)) return ["Can't reach Swissquote. Check your connection and try again."];
  // ox wraps the browser's NotAllowedError: Face ID cancelled or timed out.
  if (((e as Error).cause as Error | undefined)?.name === "NotAllowedError") return ["Face ID didn't approve it."];
  if (!(e instanceof ApiError)) return [(e as Error).message];
  if (e.status === 422) {
    // The paymaster's signature is valid for minutes; the EntryPoint rejects it after with AA32.
    const expired = /AA32|expired/i.test(String(e.body.detail));
    return [expired ? "This approval expired. Press Continue to check it again." : "Your wallet couldn't make this payment. Check the amount and try again."];
  }
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
  const snapshot = useWallet();
  // Only while the button can act: a send landing mid-flight would otherwise flash "You have $0.00." under Sending.
  const blocked = phase === "review" || phase === "confirm" ? blocker(snapshot, Number(amount)) : undefined;

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
      refreshWallet();
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
        {/* One line tall whatever it says: a blocker that wraps spills into the padding below, so nothing moves. */}
        <p className="mt-2 h-lh text-body text-balance text-muted-foreground tabular-nums">
          {blocked || `${valid ? Number(amount).toLocaleString("en-US", { maximumFractionDigits: 6 }) : 0} USDC`}
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
        <SendButton phase={phase} disabled={!valid || blocked !== undefined} onPress={phase === "confirm" ? send : check} />
      </div>
    </MotionConfig>
  );
}
