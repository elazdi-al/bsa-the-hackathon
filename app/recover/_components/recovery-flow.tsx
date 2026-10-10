"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import type { Hex } from "viem";
import { chainNow, refreshWallet, useWallet, type WalletSnapshot } from "@/app/(tabs)/_components/wallet";
import { FaceIdIcon, IdCardIcon, RestoreIcon, type Icon } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { phone, readRecoveryKey, type Credential, type Identity } from "@/lib/wallet/phone";
import { IdentityIllustration } from "./identity-illustration";

/** The steps to start a recovery. `cancelled`: this phone's last recovery was called off, here or elsewhere. */
type Step = { name: "key"; cancelled?: boolean } | { name: "identity"; secret: Hex } | { name: "restore"; secret: Hex; identity: Identity };

/**
 * Where this phone stands, from the shared wallet store. `answer`: it holds the wallet and someone is recovering it.
 * `wait`: it is the phone recovering. `outside`: no wallet here, or one it neither holds nor is recovering.
 */
type Standing = { name: "loading" | "home" | "outside" } | { name: "answer" | "wait"; executeAfter: number; skew: number };

function standing(snapshot: WalletSnapshot): Standing {
  // `offline` means a wallet is on this phone but unread: starting a recovery now could overwrite its Share A.
  if (snapshot.status === "loading" || snapshot.status === "offline") return { name: "loading" };
  if (snapshot.status !== "ready") return { name: "outside" };
  const { controls, recovery, skew } = snapshot.wallet;
  if (recovery && (controls || recovery.mine)) return { name: controls ? "answer" : "wait", executeAfter: recovery.executeAfter, skew };
  return { name: controls ? "home" : "outside" };
}

const FAILED = {
  file: "That isn't a Recovery Key. Choose the file you saved, or paste all of its text.",
  passkey: "Your passkey wasn't created. Try again.",
  key: "Your Wallet Key wasn't split. Try again.",
  start: "Your recovery didn't start. Check your Recovery Key and try again.",
  finish: "Your wallet wasn't restored yet. Try again.",
  cancel: "The recovery wasn't cancelled. Try again.",
} as const;

// House entrance (the shared `reveal` and `blurred`, in CSS): each block sharpens in; the delay classes stagger them.
const enter =
  "transition-[opacity,filter,translate] duration-450 ease-[cubic-bezier(0.23,1,0.32,1)] starting:opacity-0 motion-safe:starting:translate-y-1.5 motion-safe:starting:blur-[8px]";

const countdown = (s: number) =>
  [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n, i) => (i ? String(n).padStart(2, "0") : n)).join(":");

const restoreDate = (executeAfter: number) =>
  new Date(executeAfter * 1000).toLocaleString("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** The waiting screen's words, by who is looking and whether the hold is still running. */
const holdCopy = (date: string) => ({
  answer: {
    running: { title: "Someone started recovering your wallet", body: `If it wasn't you, cancel it before ${date} and your wallet stays on this phone.` },
    over: { title: "Someone started recovering your wallet", body: "The hold is over, so it can be finished at any moment. If it wasn't you, cancel it now." },
  },
  wait: {
    running: {
      title: `Your wallet will be restored on ${date}`,
      body: "The 48-hour hold keeps your wallet safe if someone else has your Recovery Key. You can cancel until it ends.",
    },
    over: { title: "Your wallet is ready to restore", body: "The 48-hour hold is over. Finish to restore your wallet on this phone, with the same address and balance." },
  },
});

/** Lost phone: the Recovery Key from home, an ID check, a new Passkey and Wallet Key, then the 48-hour hold in chain time. */
export function RecoveryFlow() {
  const router = useRouter();
  const at = standing(useWallet());
  const [step, setStep] = useState<Step>({ name: "key" });
  const [text, setText] = useState("");
  const [askKey, setAskKey] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  // Kept across a failed restore, so a retry resumes where it stopped instead of asking for another passkey.
  const credential = useRef<Credential>(undefined);
  const split = useRef(false);
  // The Recovery Key this session started the recovery with, so cancelling doesn't ask for it again.
  const recoveryKey = useRef<Hex>(undefined);

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
      setText("");
      setAskKey(false);
      setStep({ name: "key", cancelled: true });
    }
  }, [at.name]);

  // The countdown reads chain time on every render; this re-renders it each second while a hold runs.
  const holding = at.name === "answer" || at.name === "wait";
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!holding) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [holding]);

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

  const readKey = () => {
    const secret = readRecoveryKey(text);
    setError(secret ? undefined : FAILED.file);
    return secret;
  };

  // ponytail: mocked ID check, it calls nothing. A real provider returns references to the scanned document and selfie.
  const verify = async (secret: Hex) => {
    setBusy("Checking your ID");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setBusy(undefined);
    setStep({ name: "restore", secret, identity: { document: "mock-id-document", selfie: "mock-selfie" } });
  };

  // Face ID needs the click's user activation, so the passkey comes first, before anything else awaits.
  const restore = async (secret: Hex, identity: Identity) => {
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
      await phone.startRecovery(secret, identity);
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

  const cancel = (controls: boolean) => {
    if (controls)
      return run("Cancelling", FAILED.cancel, async () => {
        await phone.cancelRecovery();
        await refreshWallet();
      });
    if (!recoveryKey.current && !askKey) return setAskKey(true);
    const secret = recoveryKey.current ?? readKey();
    if (!secret) return;
    return run("Cancelling", FAILED.cancel, async () => {
      await phone.cancelRecoveryWithSwissquote(secret);
      await refreshWallet();
    });
  };

  const label = (idle: string) => busy ?? idle;
  const lead = (Glyph: Icon) => (busy ? <Spinner aria-hidden className="size-5" /> : <Glyph size={20} />);

  if (at.name === "loading" || at.name === "home") return <Spinner className="size-6 text-muted-foreground" />;

  if (holding) {
    const controls = at.name === "answer";
    const left = Math.max(0, Math.ceil(at.executeAfter - chainNow(at)));
    // The moment the countdown ends, on this phone's clock: a warped local chain runs ahead of it.
    const copy = holdCopy(restoreDate(at.executeAfter - at.skew))[at.name][left ? "running" : "over"];
    return (
      <Step
        key="waiting"
        art={
          <p role="timer" className="text-display tabular-nums">
            {countdown(left)}
          </p>
        }
        title={copy.title}
        body={copy.body}
        error={error}
      >
        {!controls && (
          <Button size="lg" onClick={finish} disabled={!!busy || left > 0} aria-busy={busy === "Finishing recovery"}>
            {busy === "Finishing recovery" && <Spinner aria-hidden className="size-5" />}
            Finish recovery
          </Button>
        )}
        {askKey && <KeyField value={text} onChange={setText} />}
        <Button size="lg" variant="secondary" onClick={() => cancel(controls)} disabled={!!busy} aria-busy={busy === "Cancelling"} className="text-negative">
          {busy === "Cancelling" ? <Spinner aria-hidden className="size-5" /> : controls && <FaceIdIcon size={20} />}
          {askKey ? "Cancel with Recovery Key" : "Cancel recovery"}
        </Button>
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
          body={
            step.cancelled
              ? "Your recovery was cancelled and your wallet is unchanged. To start again, choose your Recovery Key file or paste its text."
              : "Choose the Recovery Key file you saved at home, or paste its text."
          }
          error={error}
        >
          <KeyField value={text} onChange={setText} />
          <Button
            size="lg"
            disabled={!text.trim()}
            onClick={() => {
              const secret = readKey();
              if (secret) setStep({ name: "identity", secret });
            }}
          >
            Continue
          </Button>
        </Step>
      );

    case "identity":
      return (
        <Step
          key="identity"
          art={<IdentityIllustration />}
          title="Confirm it's you"
          body="Scan your ID, then take a selfie. Swissquote checks them before your wallet can be recovered."
          error={error}
        >
          <Button size="lg" onClick={() => verify(step.secret)} disabled={!!busy} aria-busy={!!busy}>
            {lead(IdCardIcon)}
            {label("Scan ID")}
          </Button>
        </Step>
      );

    case "restore":
      return (
        <Step
          key="restore"
          art={<Tile Glyph={FaceIdIcon} className="bg-sky" />}
          title="Secure this phone"
          body="Face ID creates a new Passkey, and this phone gets a new Wallet Key. Then a 48-hour hold starts, which you can cancel."
          error={error}
        >
          <Button size="lg" onClick={() => restore(step.secret, step.identity)} disabled={!!busy} aria-busy={!!busy}>
            {lead(FaceIdIcon)}
            {label("Restore with Face ID")}
          </Button>
        </Step>
      );
  }
}

function Step({ art, title, body, error, children }: { art: ReactNode; title: string; body: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex w-full max-w-[330px] flex-col items-center text-center md:[zoom:1.25]">
      <div className={enter}>{art}</div>
      <h1 className={`${enter} mt-8 text-title text-balance delay-[60ms]`}>{title}</h1>
      <p className={`${enter} mt-3 text-body text-pretty text-muted-foreground delay-[120ms]`}>{body}</p>
      <div className={`${enter} mt-8 flex w-full flex-col gap-3 delay-[180ms]`}>{children}</div>
      {error && (
        <p role="alert" className="mt-3 text-caption text-negative">
          {error}
        </p>
      )}
    </div>
  );
}

function Tile({ Glyph, className }: { Glyph: Icon; className: string }) {
  return (
    <span aria-hidden className={`grid size-14 place-items-center rounded-[18px] text-white ${className}`}>
      <Glyph size={32} />
    </span>
  );
}

function KeyField({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  return (
    <>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Recovery Key"
        placeholder="Paste your Recovery Key"
        rows={4}
        spellCheck={false}
        className="w-full resize-none rounded-2xl bg-secondary p-4 font-mono text-caption break-all caret-brand ring-brand/40 outline-none ring-inset transition-[background-color,box-shadow] duration-150 ease-out placeholder:font-sans placeholder:text-muted-foreground focus:bg-background focus:ring-[1.5px]"
      />
      <label className={buttonVariants({ variant: "secondary", className: "cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-solid" })}>
        <RestoreIcon size={20} />
        Choose file
        <input
          type="file"
          accept=".txt,text/plain"
          onChange={async (e) => {
            const file = await e.target.files?.[0]?.text();
            if (file) onChange(file);
          }}
          className="sr-only"
        />
      </label>
    </>
  );
}
