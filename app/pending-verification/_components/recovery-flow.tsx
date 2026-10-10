"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isAddressEqual, type Hex } from "viem";
import { FaceIdIcon, IdCardIcon, RestoreIcon, type Icon } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { phone, readRecoveryKey, type Credential, type Identity } from "@/lib/wallet/phone";
import { IdentityIllustration } from "./identity-illustration";

type Stage =
  | { name: "loading" }
  | { name: "key" }
  | { name: "identity"; secret: Hex }
  | { name: "restore"; secret: Hex; identity: Identity }
  /** `secret` is gone after a reload; `controls`: this is the phone that still holds the wallet. */
  | { name: "waiting"; executeAfter: number; controls: boolean; secret?: Hex };

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

// Finalizing is checked against the latest block, which lags the wall clock by a few seconds.
const CHAIN_LAG = 5;

const countdown = (s: number) =>
  [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n, i) => (i ? String(n).padStart(2, "0") : n)).join(":");

const restoreDate = (executeAfter: number) =>
  new Date(executeAfter * 1000).toLocaleString("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Where this phone stands: no wallet yet, a recovery it started or must answer, or a wallet it already holds (undefined). */
async function load(): Promise<Stage | undefined> {
  if (!phone.hasWallet()) return { name: "key" };
  const { signer, pendingRecovery } = await phone.state();
  const mine = phone.device()!.signer;
  const controls = isAddressEqual(mine, signer);
  if (pendingRecovery && (controls || isAddressEqual(mine, pendingRecovery.signer)))
    return { name: "waiting", executeAfter: pendingRecovery.executeAfter, controls };
  return controls ? undefined : { name: "key" };
}

/** Lost phone: the Recovery Key from home, an ID check, a new Passkey and Wallet Key, then the 48-hour hold. */
export function RecoveryFlow() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ name: "loading" });
  const [text, setText] = useState("");
  const [askKey, setAskKey] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(() => Date.now() / 1000);
  // Kept across a failed restore, so a retry resumes where it stopped instead of asking for another passkey.
  const credential = useRef<Credential>(undefined);
  const split = useRef(false);

  const home = () => router.replace("/home", { transitionTypes: ["push"] });

  useEffect(() => {
    load().then(
      (next) => (next ? setStage(next) : router.replace("/home")),
      () => setStage({ name: "key" }),
    );
  }, [router]);

  const waiting = stage.name === "waiting";
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, [waiting]);

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
    setStage({ name: "restore", secret, identity: { document: "mock-id-document", selfie: "mock-selfie" } });
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
      const { executeAfter } = await phone.startRecovery(secret, identity);
      setStage({ name: "waiting", executeAfter, controls: false, secret });
    } catch {
      setError(failed);
    }
    setBusy(undefined);
  };

  const finish = () =>
    run("Finishing recovery", FAILED.finish, async () => {
      await phone.finalizeRecovery();
      home();
    });

  const cancel = (stage: Extract<Stage, { name: "waiting" }>) => {
    if (stage.controls)
      return run("Cancelling", FAILED.cancel, async () => {
        await phone.cancelRecovery();
        home();
      });
    if (!stage.secret && !askKey) return setAskKey(true);
    const secret = stage.secret ?? readKey();
    if (!secret) return;
    return run("Cancelling", FAILED.cancel, async () => {
      await phone.cancelRecoveryWithSwissquote(secret);
      setText("");
      setAskKey(false);
      setStage({ name: "key" });
    });
  };

  const label = (idle: string) => busy ?? idle;
  const lead = (Glyph: Icon) => (busy ? <Spinner aria-hidden className="size-5" /> : <Glyph size={20} />);

  switch (stage.name) {
    case "loading":
      return <Spinner className="size-6 text-muted-foreground" />;

    case "key":
      return (
        <Step
          key="key"
          art={<Tile Glyph={RestoreIcon} className="bg-purple" />}
          title="Recover your wallet"
          body="Choose the Recovery Key file you saved at home, or paste its text."
          error={error}
        >
          <KeyField value={text} onChange={setText} />
          <Button
            size="lg"
            disabled={!text.trim()}
            onClick={() => {
              const secret = readKey();
              if (secret) setStage({ name: "identity", secret });
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
          <Button size="lg" onClick={() => verify(stage.secret)} disabled={!!busy} aria-busy={!!busy}>
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
          <Button size="lg" onClick={() => restore(stage.secret, stage.identity)} disabled={!!busy} aria-busy={!!busy}>
            {lead(FaceIdIcon)}
            {label("Restore with Face ID")}
          </Button>
        </Step>
      );

    case "waiting": {
      const left = Math.max(0, Math.ceil(stage.executeAfter + CHAIN_LAG - now));
      const date = restoreDate(stage.executeAfter);
      return (
        <Step
          key="waiting"
          art={
            <p role="timer" className="text-display tabular-nums">
              {countdown(left)}
            </p>
          }
          title={stage.controls ? "Someone started recovering your wallet" : `Your wallet will be restored on ${date}`}
          body={
            stage.controls
              ? `If it wasn't you, cancel it before ${date}. Your wallet stays on this phone.`
              : "The 48-hour hold keeps your wallet safe if someone else has your Recovery Key. You can cancel until it ends."
          }
          error={error}
        >
          {!stage.controls && (
            <Button size="lg" onClick={finish} disabled={!!busy || left > 0} aria-busy={busy === "Finishing recovery"}>
              {busy === "Finishing recovery" && <Spinner aria-hidden className="size-5" />}
              Finish recovery
            </Button>
          )}
          {askKey && <KeyField value={text} onChange={setText} />}
          <Button size="lg" variant="secondary" onClick={() => cancel(stage)} disabled={!!busy} aria-busy={busy === "Cancelling"} className="text-negative">
            {busy === "Cancelling" ? <Spinner aria-hidden className="size-5" /> : stage.controls && <FaceIdIcon size={20} />}
            {askKey ? "Cancel with Recovery Key" : "Cancel recovery"}
          </Button>
        </Step>
      );
    }
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
        className="w-full resize-none rounded-2xl bg-secondary p-4 font-mono text-caption break-all caret-fuse-blue ring-fuse-blue/40 outline-none ring-inset transition-[background-color,box-shadow] duration-150 ease-out placeholder:font-sans placeholder:text-muted-foreground focus:bg-background focus:ring-[1.5px]"
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
