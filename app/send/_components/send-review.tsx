"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { encodeFunctionData, erc20Abi, getAddress, parseUnits, type Address } from "viem";
import { grouped, retyped } from "@/app/(tabs)/_components/amount";
import { usd } from "@/app/(tabs)/_components/money";
import { refreshWallet, useWallet, type WalletSnapshot } from "@/app/(tabs)/_components/wallet";
import { recipientFor, sendDraft, shortAddress } from "@/app/choose-recipient/data";
import { CheckIcon, LightningIcon, ShieldIcon, WalletIcon } from "@/components/icons";
import { useBack } from "@/components/navigation";
import { BackButton } from "@/components/ui/back-button";
import { DemoTag } from "@/components/ui/demo-tag";
import { ethAmount } from "@/lib/wallet/account";
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
export function blocker(snapshot: WalletSnapshot, amount: number): string | undefined {
  if (snapshot.status !== "ready") return UNAVAILABLE[snapshot.status];
  const { controls, locked, recovery, restoring, usdc } = snapshot.wallet;
  if (!controls) {
    if (recovery?.mine) return "You can send once your wallet is restored on this phone.";
    return restoring ? "Your recovery was cancelled, so this phone can't send yet." : "Your wallet moved to another phone, so this one can't send from it.";
  }
  if (locked) return "Swissquote locked this phone after it was reported lost.";
  if (amount > usdc) return `Only ${usd.format(usdc)} available.`;
}

/**
 * What Swissquote confirmed before it prepared a payment: it refuses one that fails screening or simulation, so
 * reaching Send means both passed. The fee is the row above.
 */
const CHECKS = ["Recipient not on a sanctions list", "Simulated: it moves only this amount"];

/** Swissquote's reading of the payment it checked, before Face ID: its summary and the checks it passed. */
function Checked({ summary, demo }: { summary: string[]; demo?: boolean }) {
  return (
    <motion.section key="checked" {...blurSwap} className="mt-6 rounded-[22px] bg-secondary p-4">
      <h2 className="flex items-center gap-2 text-label">
        <ShieldIcon size={20} className="shrink-0 text-positive" />
        Checked by Swissquote
        {demo && <DemoTag className="ml-auto" />}
      </h2>
      {summary.map((line) => (
        <p key={line} className="mt-2 text-body text-pretty">
          {line.replace(/0x[0-9a-f]{40}/gi, (address) => shortAddress(getAddress(address)))}
        </p>
      ))}
      <ul className="mt-3 flex flex-col gap-1.5 text-body text-muted-foreground">
        {CHECKS.map((check) => (
          <li key={check} className="flex gap-2">
            <CheckIcon size={16} className="mt-0.5 shrink-0 text-positive" />
            {check}
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

/** Swissquote's refusal and its reasons, a known failure in plain words, or the error as is. */
export function failure(e: unknown): string[] {
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

export function SendReview() {
  const params = useSearchParams();
  const to = params.get("to");
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
    <Review to={to} address={shown.address as Address} asked={params.get("amount")}>
      <section aria-label="Recipient" className="flex items-center gap-4">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground">
          <WalletIcon />
        </span>
        <p className="min-w-0 flex-1">
          <span className="block truncate text-label">{shown.name}</span>
          <span className="flex items-center gap-2 text-body text-muted-foreground">
            <span className="truncate">{shown.detail}</span>
            {shown.demo && <DemoTag />}
          </span>
        </p>
      </section>
    </Review>
  );
}

/** Continue asks Swissquote to prepare the transfer, sponsored if the wallet is linked; Send is Face ID approving exactly that operation. */
function Review({ to, address, asked, children }: { to: string; address: Address; asked: string | null; children: ReactNode }) {
  const router = useRouter();
  const back = useBack("/choose-recipient");
  // A scanned payment request fills in its amount; the client can still change it.
  const [amount, setAmount] = useState(() => (asked && AMOUNT.test(asked) ? asked : ""));
  const [phase, setPhase] = useState<Phase>("review");
  const [prepared, setPrepared] = useState<Prepared>();
  const [sent, setSent] = useState<Sent>();
  const [error, setError] = useState<string[]>([]);

  const valid = AMOUNT.test(amount) && Number(amount) > 0;
  const snapshot = useWallet();
  // Only while the button can act: a send landing mid-flight would otherwise flash "Only $0.00 available." under Sending.
  const blocked = phase === "review" || phase === "confirm" ? blocker(snapshot, Number(amount)) : undefined;

  useEffect(() => sendDraft.set(to), [to]);

  useEffect(() => {
    if (!sent) return;
    const id = setTimeout(() => {
      const tracked = new URLSearchParams({ hash: sent.transactionHash, amount, to: address });
      if (prepared?.fee) tracked.set("fee", prepared.fee);
      // Replace, so Back from the tracker can't land on a review that's already sent.
      router.replace(`/transaction-tracking?${tracked}`, { transitionTypes: ["push"] });
    }, SENT_MS);
    return () => clearTimeout(id);
  }, [sent, amount, address, prepared?.fee, router]);

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
      // Start over with a fresh operation: Swissquote's check of this one expires within minutes.
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

        <dl className="mt-6 flex items-start justify-between gap-4 text-body">
          <dt className="shrink-0 text-muted-foreground">Network fee</dt>
          {prepared?.fee ? (
            <dd className="text-right font-semibold text-balance">
              Up to {ethAmount(BigInt(prepared.fee))} ETH<span className="font-normal text-muted-foreground">, paid from your wallet</span>
            </dd>
          ) : prepared || (snapshot.status === "ready" && snapshot.wallet.owner) ? (
            <dd className="flex items-center gap-1 font-semibold text-positive">
              <LightningIcon size={16} />
              Paid by Swissquote
            </dd>
          ) : (
            <dd className="font-semibold">{snapshot.status === "ready" && "Paid from your wallet"}</dd>
          )}
        </dl>

        <AnimatePresence initial={false}>{prepared?.summary && <Checked summary={prepared.summary} demo={prepared.demo} />}</AnimatePresence>

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
      </div>
    </MotionConfig>
  );
}
