"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { encodeFunctionData, erc20Abi, parseUnits, type Address } from "viem";
import { grouped, retyped } from "@/app/(tabs)/_components/amount";
import { usd } from "@/app/(tabs)/_components/money";
import { phoneDate, refreshWallet, useWallet, type WalletSnapshot } from "@/app/(tabs)/_components/wallet";
import { recipientFor, sendDraft } from "@/app/choose-recipient/data";
import { ClockIcon, WalletIcon } from "@/components/icons";
import { useBack } from "@/components/navigation";
import { BackButton } from "@/components/ui/back-button";
import { ApiError, phone, type Prepared, type Sent } from "@/lib/wallet/phone";
import { blurSwap } from "./motion";
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
  const { controls, recovery, restoring, usdc } = snapshot.wallet;
  if (!controls) {
    if (recovery?.mine) return "You can send once your wallet is restored on this phone.";
    return restoring ? "Your recovery was cancelled, so this phone can't send yet." : "Your wallet moved to another phone, so this one can't send from it.";
  }
  if (amount > usdc) return `Only ${usd.format(usdc)} available.`;
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

export function SendReview({ children }: { children: ReactNode }) {
  const to = useSearchParams().get("to");
  const wallet = useWallet();
  // The picker refuses the wallet's own address; a typed-in link to it goes back there too.
  const own = wallet.status === "ready" ? wallet.wallet.address.toLowerCase() : undefined;
  const shown = to === null ? null : recipientFor(to);
  const usable = shown && shown.address.toLowerCase() !== own;
  const router = useRouter();

  useEffect(() => {
    if (!usable) router.replace("/choose-recipient");
  }, [usable, router]);

  if (to === null || !shown || !usable) return null;
  return (
    <Review to={to} address={shown.address as Address}>
      <section aria-label="Recipient" className="flex items-center gap-4">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
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
  const back = useBack("/choose-recipient");
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("review");
  const [prepared, setPrepared] = useState<Prepared>();
  const [sent, setSent] = useState<Sent>();
  const [error, setError] = useState<string[]>([]);

  useEffect(() => sendDraft.set(to), [to]);

  useEffect(() => {
    if (!sent) return;
    const id = setTimeout(() => {
      const tracked = new URLSearchParams({ hash: "transactionHash" in sent ? sent.transactionHash : sent.hash, amount, to: address });
      if ("releaseAt" in sent) tracked.set("leaves", String(sent.releaseAt));
      // Replace, so Back from the tracker can't land on a review that's already sent.
      router.replace(`/transaction-tracking?${tracked}`, { transitionTypes: ["push"] });
    }, SENT_MS);
    return () => clearTimeout(id);
  }, [sent, amount, address, router]);

  const valid = AMOUNT.test(amount) && Number(amount) > 0;
  const snapshot = useWallet();
  // Only while the button can act: a send landing mid-flight would otherwise flash "Only $0.00 available." under Sending.
  const blocked = phase === "review" || phase === "confirm" ? blocker(snapshot, Number(amount)) : undefined;
  const releaseAt = prepared?.releaseAt;

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
      // Paid, so the chooser must not come back filled in, even if the tracker never opens.
      sendDraft.clear();
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
      <header className="mx-auto mt-4 flex h-10 w-full max-w-md shrink-0 items-center gap-3 px-6">
        {/* Leaving before the tracker opens would reopen the chooser, filled in, inviting a second payment. */}
        <BackButton onClick={back} disabled={phase === "sending" || phase === "sent"} />
        <h1 className="text-label">Send</h1>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 md:justify-center">
        <div className="pt-16 pb-20 text-center md:pt-0">
          <label className="flex items-baseline justify-center text-display tabular-nums">
            <span aria-hidden>$</span>
            <input
              value={amount && grouped(amount)}
              onChange={(e) => {
                const next = retyped(e.target.value, 6);
                if (next === amount) return;
                setAmount(next);
                reset();
              }}
              readOnly={phase === "checking" || phase === "sending" || phase === "sent"}
              inputMode="decimal"
              aria-label="Amount in USDC"
              placeholder="0"
              style={{ width: `${grouped(amount).length}ch` }}
              className="bg-transparent caret-brand outline-none"
            />
          </label>
          {/* One line tall whatever it says: a blocker that wraps spills into the padding below, so nothing moves. */}
          <p className="mt-2 h-lh text-body text-balance text-muted-foreground tabular-nums">
            {blocked ?? (snapshot.status === "ready" && `${usd.format(snapshot.wallet.usdc)} available`)}
          </p>
        </div>

        {children}

        <div className="mt-auto pt-10 md:mt-0">
          {/* Two lines kept free whatever it says, so the button doesn't move when a large payment's notice comes in. */}
          <div className="mb-3 flex h-[2lh] items-end justify-center text-center text-caption text-balance text-muted-foreground tabular-nums">
            <AnimatePresence initial={false}>
              {releaseAt !== undefined && snapshot.status === "ready" && (
                <motion.p key="held" {...blurSwap}>
                  <ClockIcon size={16} className="mr-1 inline-block align-[-3px]" />
                  Large payment. It leaves on {phoneDate(snapshot.wallet, releaseAt)}, and you can cancel until then.
                </motion.p>
              )}
            </AnimatePresence>
          </div>
          {error.length > 0 && (
            <div role="alert" className="mb-3 text-center text-caption text-negative">
              {error.map((line) => (
                <p key={line} className="first-letter:uppercase">
                  {line}
                </p>
              ))}
            </div>
          )}
          <SendButton phase={phase} held={releaseAt !== undefined} disabled={!valid || blocked !== undefined} onPress={phase === "confirm" ? send : check} />
        </div>
      </div>
    </MotionConfig>
  );
}
