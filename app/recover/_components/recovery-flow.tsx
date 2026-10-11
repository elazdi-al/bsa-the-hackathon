"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import type { Address, Hex } from "viem";
import { chainNow, refreshWallet, useWallet, type WalletSnapshot } from "@/app/(tabs)/_components/wallet";
import { CheckIcon, FaceIdIcon, LockIcon, RestoreIcon, ShieldIcon, WarningIcon, type Icon } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { ApiError, phone, readRecoveryKey, type Credential } from "@/lib/wallet/phone";

/**
 * The steps to start a recovery, the same for every wallet. `notice` says why the key step is back. `pending`: the
 * Recovery Key's wallet already has a recovery running that this phone didn't start; its holder may cancel it through
 * Swissquote before going on. `refused`: no wallet uses the key, so it asks for another.
 */
type Step =
  | { name: "key"; notice?: string }
  | { name: "pending"; secret: Hex; address: Address; executeAfter: number; skew: number }
  | { name: "restore"; secret: Hex }
  | { name: "refused" };

/**
 * Where this phone stands, from the shared wallet store. `answer`: it holds the wallet and someone is recovering it.
 * `wait`: it is the phone recovering. `outside`: no wallet here, or one it neither holds nor is recovering.
 */
type Standing =
  | { name: "loading" | "home" | "outside" }
  | { name: "answer" | "wait"; executeAfter: number; skew: number; oldPhoneLocked: boolean };

function standing(snapshot: WalletSnapshot): Standing {
  // `offline` means a wallet is on this phone but unread: starting a recovery now could overwrite its Share A.
  if (snapshot.status === "loading" || snapshot.status === "offline") return { name: "loading" };
  if (snapshot.status !== "ready") return { name: "outside" };
  const { controls, recovery, skew } = snapshot.wallet;
  if (recovery && (controls || recovery.mine))
    return { name: controls ? "answer" : "wait", executeAfter: recovery.executeAfter, skew, oldPhoneLocked: recovery.oldPhoneLocked };
  return { name: controls ? "home" : "outside" };
}

const FAILED = {
  file: "That isn't a Recovery Key. Try the file you saved.",
  offline: "Can't reach Swissquote. Try again.",
  passkey: "Your passkey wasn't created. Try again.",
  key: "Your Wallet Key wasn't split. Try again.",
  start: "Your recovery didn't start. Try again.",
  finish: "Your wallet wasn't restored yet. Try again.",
  cancel: "The recovery wasn't cancelled. Try again.",
  lock: "Your old phone wasn't locked. Try again.",
} as const;

// House entrance (the shared `reveal` and `blurred`, in CSS): each block sharpens in; the delay classes stagger them.
const enter =
  "transition-[opacity,filter,translate] duration-450 ease-[cubic-bezier(0.23,1,0.32,1)] starting:opacity-0 motion-safe:starting:translate-y-1.5 motion-safe:starting:blur-[8px]";

const field =
  "w-full rounded-2xl bg-secondary caret-brand ring-brand/40 outline-none ring-inset transition-[background-color,box-shadow] duration-150 ease-out placeholder:text-muted-foreground focus:bg-background focus:ring-[1.5px]";

/** A secondary action, as quiet text under the one primary button. */
const quiet = "h-11 self-center px-4 text-body font-semibold text-muted-foreground";

const countdown = (s: number) =>
  [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n, i) => (i ? String(n).padStart(2, "0") : n)).join(":");

const shortDate = (executeAfter: number) =>
  new Date(executeAfter * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** The hold's words, by who is looking and whether it is still running. */
const holdCopy = (date: string) => ({
  answer: {
    running: { title: "Someone is recovering your wallet", body: `Not you? Cancel it before ${date}.` },
    over: { title: "Someone is recovering your wallet", body: "Not you? Cancel it now." },
  },
  wait: {
    running: { title: "Recovery started", body: `You can cancel until ${date}.` },
    over: { title: "Your wallet is ready", body: "Finish to restore it on this phone." },
  },
});

/** Lost phone: the Recovery Key from home, a new Passkey and Wallet Key, then the 48-hour hold in chain time. */
export function RecoveryFlow() {
  const router = useRouter();
  const at = standing(useWallet());
  const [step, setStep] = useState<Step>({ name: "key" });
  const [askKey, setAskKey] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  // Kept across a failed restore, so a retry resumes where it stopped instead of asking for another passkey.
  const credential = useRef<Credential>(undefined);
  const split = useRef(false);
  // The Recovery Key this session started the recovery with, so cancelling or locking the old phone doesn't ask for it
  // again, and whether its wallet is linked to a Swissquote client: only a linked wallet's old phone can be locked.
  const recoveryKey = useRef<Hex>(undefined);
  const linked = useRef(false);

  const home = () => router.replace("/home", { transitionTypes: ["push"] });

  // What happens elsewhere lands here through the store. Before paint, so a cancelled hold never flashes the step behind it.
  const was = useRef(at.name);
  useLayoutEffect(() => {
    const before = was.current;
    was.current = at.name;
    setError(undefined);
    // This phone now holds the wallet with nothing to answer; or an old phone lost it to a finished recovery, which Home explains.
    if (at.name === "home" || (before === "answer" && at.name === "outside")) home();
    else if (before === "wait" && at.name === "outside") {
      recoveryKey.current = undefined;
      linked.current = false;
      setAskKey(false);
      setStep({ name: "key", notice: "Recovery cancelled. Your wallet is unchanged." });
    }
  }, [at.name]);

  // The countdown reads chain time on every render; this re-renders it each second while a hold runs.
  const holding = at.name === "answer" || at.name === "wait";
  const counting = holding || step.name === "pending";
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [counting]);

  async function run(label: string, failed: string, work: () => Promise<void>) {
    setBusy(label);
    setError(undefined);
    try {
      await work();
    } catch {
      setError(failed);
    }
    setBusy(undefined);
  }

  // Face ID needs the click's user activation, so the passkey comes first, before anything else awaits.
  const restore = async (secret: Hex) => {
    setError(undefined);
    let failed: string = FAILED.passkey;
    try {
      setBusy("Creating Passkey");
      credential.current ??= await phone.createPasskey();
      failed = FAILED.key;
      setBusy("Splitting Wallet Key");
      if (!split.current) await phone.splitKey(credential.current);
      split.current = true;
      failed = FAILED.start;
      setBusy("Starting recovery");
      // Before the await: the recovery can start on-chain even if the read after it fails.
      recoveryKey.current = secret;
      await phone.startRecovery(secret);
      await refreshWallet();
    } catch {
      setError(failed);
    }
    setBusy(undefined);
  };

  // The store moves the screen on from finish and cancel: to Home once this phone holds the wallet, to the first step once the recovery is gone.
  const finish = () =>
    run("Finishing recovery", FAILED.finish, async () => {
      await phone.finalizeRecovery();
      await refreshWallet();
    });

  const cancelWithKey = (secret: Hex | undefined) => {
    if (!secret) return setError(FAILED.file);
    return run("Cancelling", FAILED.cancel, async () => {
      await phone.cancelRecoveryWithSwissquote(secret);
      await refreshWallet();
    });
  };

  // The old phone cancels with Face ID. A locked one can't, and a reopened recovering phone forgot the key, so they ask for it.
  const cancel = (faceId: boolean) => {
    if (faceId)
      return run("Cancelling", FAILED.cancel, async () => {
        await phone.cancelRecovery();
        await refreshWallet();
      });
    if (recoveryKey.current) return cancelWithKey(recoveryKey.current);
    setAskKey(true);
  };

  const lockOldPhone = (secret: Hex) =>
    run("Locking", FAILED.lock, async () => {
      await phone.lockPhone(secret);
      await refreshWallet();
    });

  // A recovery someone else started blocks a new one, and only the key's holder can call it off.
  const check = (secret: Hex | undefined) => {
    if (!secret) return setError(FAILED.file);
    return run("Checking", FAILED.offline, async () => {
      const found = await phone.findRecovery(secret).catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      });
      if (!found) return setStep({ name: "refused" });
      const { address, pendingRecovery, chainTime } = found;
      linked.current = found.linked;
      const skew = Math.round(chainTime - Date.now() / 1000);
      if (pendingRecovery) return setStep({ name: "pending", secret, address, executeAfter: pendingRecovery.executeAfter, skew });
      setStep({ name: "restore", secret });
    });
  };

  const cancelTheirs = (secret: Hex, address: Address) =>
    run("Cancelling", FAILED.cancel, async () => {
      await phone.cancelRecoveryWithSwissquote(secret, address);
      setStep({ name: "key", notice: "That recovery is cancelled. You can start yours." });
    });

  const spinner = <Spinner aria-hidden className="size-5" />;

  if (at.name === "loading" || at.name === "home") return <Spinner className="size-6 text-muted-foreground" />;

  if (holding) {
    const controls = at.name === "answer";
    const faceId = controls && !at.oldPhoneLocked;
    const left = Math.max(0, Math.ceil(at.executeAfter - chainNow(at)));
    // The moment the countdown ends, on this phone's clock: a warped local chain runs ahead of it.
    const copy = holdCopy(shortDate(at.executeAfter - at.skew))[at.name][left ? "running" : "over"];
    const cancelling = busy === "Cancelling";
    const canLock = at.name === "wait" && linked.current && recoveryKey.current;
    return (
      <Step
        // The hold ending is news: the screen comes in again, from the countdown to what's next.
        key={left ? "hold" : "hold-over"}
        art={left ? <Countdown label={controls ? "Time to cancel" : "Ready in"} left={left} /> : controls ? <Tile Glyph={WarningIcon} className="bg-negative" /> : <Tile Glyph={CheckIcon} className="bg-positive" />}
        title={copy.title}
        body={askKey ? "Choose your Recovery Key file to cancel." : copy.body}
        error={error}
      >
        {askKey ? (
          <KeyEntry cta="Cancel recovery" busy={cancelling ? busy : undefined} destructive onKey={cancelWithKey} />
        ) : (
          <>
            {!controls && !left && (
              <Button size="lg" onClick={finish} disabled={!!busy} aria-busy={busy === "Finishing recovery"}>
                {busy === "Finishing recovery" && spinner}
                Finish recovery
              </Button>
            )}
            {controls ? (
              <Button size="lg" variant="destructive" onClick={() => cancel(faceId)} disabled={!!busy} aria-busy={cancelling}>
                {cancelling ? spinner : faceId && <FaceIdIcon size={20} />}
                Cancel recovery
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => cancel(false)} disabled={!!busy} aria-busy={cancelling} className={cn(quiet, "text-negative")}>
                {cancelling && spinner}
                Cancel recovery
              </Button>
            )}
            {/* Opt-in: once locked, the old phone can no longer cancel a stranger's recovery with Face ID. */}
            {at.name === "wait" &&
              (at.oldPhoneLocked ? (
                <p role="status" className={cn(enter, quiet, "flex items-center gap-2 font-normal")}>
                  <LockIcon size={18} />
                  Your old phone is locked
                </p>
              ) : (
                canLock && (
                  <Button variant="ghost" onClick={() => lockOldPhone(recoveryKey.current!)} disabled={!!busy} aria-busy={busy === "Locking"} className={quiet}>
                    {busy === "Locking" ? spinner : <LockIcon size={18} />}
                    Lock your old phone
                  </Button>
                )
              ))}
          </>
        )}
      </Step>
    );
  }

  switch (step.name) {
    case "key":
      return (
        <Step
          key="key"
          art={<Tile Glyph={RestoreIcon} className="bg-purple" />}
          title="Recover your wallet"
          body={step.notice ?? "Use the Recovery Key you saved at home."}
          error={error}
        >
          <KeyEntry cta="Continue" busy={busy} onKey={check} />
        </Step>
      );

    case "refused":
      return (
        <Step
          key="refused"
          art={<Tile Glyph={ShieldIcon} className="bg-muted-foreground" />}
          title="No wallet uses this key"
          body="Try the file you saved at setup."
          error={error}
        >
          <KeyEntry cta="Continue" busy={busy} onKey={check} />
        </Step>
      );

    case "pending": {
      const left = Math.max(0, Math.ceil(step.executeAfter - chainNow(step)));
      return (
        <Step
          key="pending"
          art={<Countdown label="Time to cancel" left={left} />}
          title="A recovery is already running"
          body={`Not you? Cancel it before ${shortDate(step.executeAfter - step.skew)}.`}
          error={error}
        >
          <Button size="lg" variant="destructive" onClick={() => cancelTheirs(step.secret, step.address)} disabled={!!busy} aria-busy={!!busy}>
            {busy && spinner}
            Cancel recovery
          </Button>
          <Button variant="ghost" onClick={() => setStep({ name: "key" })} disabled={!!busy} className={quiet}>
            Back
          </Button>
        </Step>
      );
    }

    case "restore":
      return (
        <Step
          key="restore"
          art={<Tile Glyph={FaceIdIcon} className="bg-sky" />}
          title="Secure this phone"
          body="Your wallet arrives after a 48-hour hold."
          error={error}
        >
          <Button size="lg" onClick={() => restore(step.secret)} disabled={!!busy} aria-busy={!!busy}>
            {busy ? spinner : <FaceIdIcon size={20} />}
            {busy ?? "Restore with Face ID"}
          </Button>
        </Step>
      );
  }
}

function Step({ art, title, body, error, children }: { art: ReactNode; title: string; body: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex w-full max-w-[330px] flex-col items-center text-center md:[zoom:1.25]">
      <div className={enter}>{art}</div>
      <h1 className={cn(enter, "mt-6 text-title text-balance delay-[60ms]")}>{title}</h1>
      <p className={cn(enter, "mt-2 text-body text-pretty text-muted-foreground delay-[120ms]")}>{body}</p>
      <div className={cn(enter, "mt-8 flex w-full flex-col gap-2 delay-[180ms]")}>{children}</div>
      {error && (
        <p role="alert" className="mt-3 text-caption text-pretty text-negative">
          {error}
        </p>
      )}
    </div>
  );
}

function Tile({ Glyph, className }: { Glyph: Icon; className: string }) {
  return (
    <span aria-hidden className={cn("grid size-14 place-items-center rounded-[18px] text-white", className)}>
      <Glyph size={32} />
    </span>
  );
}

/** The time left on a hold, under a short label saying what it counts down to. */
function Countdown({ label, left }: { label: string; left: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p role="timer" className="text-display tabular-nums">
        {countdown(left)}
      </p>
    </div>
  );
}

/**
 * The Recovery Key: the file the client saved, read the moment it is chosen, or its text pasted, which `cta` sends.
 * `onKey` gets undefined when there is no key in either.
 */
function KeyEntry({ cta, busy, destructive, onKey }: { cta: string; busy?: string; destructive?: boolean; onKey: (secret: Hex | undefined) => void }) {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const spinner = <Spinner aria-hidden className="size-5" />;

  if (pasting)
    return (
      <>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Recovery Key"
          placeholder="Paste your Recovery Key"
          rows={3}
          spellCheck={false}
          className={cn(enter, field, "resize-none p-4 font-mono text-caption break-all placeholder:font-sans")}
        />
        <Button size="lg" variant={destructive ? "destructive" : "default"} onClick={() => onKey(readRecoveryKey(text))} disabled={!text.trim() || !!busy} aria-busy={!!busy}>
          {busy && spinner}
          {busy ?? cta}
        </Button>
        <Button variant="ghost" onClick={() => setPasting(false)} disabled={!!busy} className={quiet}>
          Choose the file instead
        </Button>
      </>
    );

  return (
    <>
      <label
        aria-busy={!!busy}
        className={buttonVariants({
          size: "lg",
          className: cn(
            "cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-solid",
            busy && "pointer-events-none",
          ),
        })}
      >
        {busy ? spinner : <RestoreIcon size={20} />}
        {busy ?? "Choose Recovery Key file"}
        <input
          type="file"
          accept=".txt,text/plain"
          disabled={!!busy}
          onChange={async (e) => {
            const file = await e.target.files?.[0]?.text();
            // Cleared, so choosing the same file again after a refusal still reads it.
            e.target.value = "";
            if (file !== undefined) onKey(readRecoveryKey(file));
          }}
          className="sr-only"
        />
      </label>
      <Button variant="ghost" onClick={() => setPasting(true)} disabled={!!busy} className={quiet}>
        Paste it instead
      </Button>
    </>
  );
}
