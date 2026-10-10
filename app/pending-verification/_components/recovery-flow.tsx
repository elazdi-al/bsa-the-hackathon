"use client";

import { CheckCircleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isAddressEqual, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, kitKey, mockSelfie, startRecovery } from "@/lib/wallet/browser";
import { IdentityIllustration } from "./identity-illustration";

type Stage =
  | { name: "loading" | "identity" | "kit" | "restoring" | "done" }
  | { name: "waiting"; executeAfter: number };

type Pending = { pending: false } | { pending: true; executeAfter: number };

// House entrance (the shared `reveal` and `blurred`, in CSS): each block sharpens in; the delay classes stagger them.
const enter =
  "transition-[opacity,filter,translate] duration-450 ease-[cubic-bezier(0.23,1,0.32,1)] starting:opacity-0 motion-safe:starting:translate-y-1.5 motion-safe:starting:blur-[8px]";
const title = `${enter} mt-10 text-[20px] leading-6 font-semibold text-balance delay-[60ms]`;
const body = `${enter} mt-3.5 max-w-[310px] text-[13px] leading-[19px] text-black/40 delay-[120ms]`;
const actions = `${enter} mt-8 flex w-[280px] flex-col gap-2 delay-[180ms]`;

// Finalizing is checked against the latest block, which lags the wall clock by a few seconds.
const CHAIN_LAG = 5;

const restoreDate = (executeAfter: number) =>
  new Date(executeAfter * 1000).toLocaleString("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/**
 * Lost phone, new browser: ID and liveness check, the Recovery Kit, then a new passkey and key ceremony.
 * Swissquote and the partner co-sign initiateRecovery, which waits out the on-chain delay; the client can
 * cancel during it and anyone can finalize after it.
 */
export function RecoveryFlow() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ name: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [kit, setKit] = useState("");
  const [now, setNow] = useState(() => Date.now() / 1000);

  const toPending = (r: Pending) => setStage(r.pending ? { name: "waiting", executeAfter: r.executeAfter } : { name: "identity" });

  useEffect(() => {
    // A wallet never used on-chain has no recovery state: the identity step then explains.
    api<Pending>("GET", "/api/recovery").then(toPending, () => setStage({ name: "identity" }));
  }, []);

  const waiting = stage.name === "waiting";
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, [waiting]);

  async function step(run: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await run();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const verify = (impostor: boolean) =>
    step(async () => {
      await api("POST", "/api/recovery", { document: "id-card-scan", selfie: mockSelfie(impostor) });
      setStage({ name: "kit" });
    });

  const restore = () =>
    step(async () => {
      const key = kitKey(kit);
      if (!key) throw new Error("That doesn't look like a Recovery Kit. Paste the whole kit or choose its file.");
      const { config } = await api<{ config: { confirmationKey: Address } }>("GET", "/api/wallet");
      if (!isAddressEqual(privateKeyToAccount(key).address, config.confirmationKey)) {
        throw new Error("This Recovery Kit belongs to another wallet.");
      }
      setStage({ name: "restoring" });
      try {
        await startRecovery(key);
      } catch (e) {
        setStage({ name: "kit" });
        throw e;
      }
      toPending(await api<Pending>("GET", "/api/recovery"));
    });

  const finalize = () =>
    step(async () => {
      await api("PATCH", "/api/recovery");
      setStage({ name: "done" });
    });

  const cancel = () =>
    step(async () => {
      await api("DELETE", "/api/recovery");
      setStage({ name: "identity" });
    });

  const errorLine = (
    <p aria-live="polite" className="mt-4 max-w-[300px] text-[13px] leading-[18px] text-negative first-letter:uppercase empty:hidden">
      {error}
    </p>
  );

  if (stage.name === "loading") return <Spinner aria-label="Loading" className="size-6 text-black/30" />;

  if (stage.name === "identity")
    return (
      <div key="identity" className="flex flex-col items-center text-center md:[zoom:1.25]">
        <div className={enter}>
          <IdentityIllustration />
        </div>
        <h1 className={title}>Verify your identity</h1>
        <p className={body}>
          Scan your ID and take a selfie. We match them against your Swissquote account opening before anyone can
          recover your wallet. Mocked in this demo.
        </p>
        <div className={actions}>
          <Button onClick={() => verify(false)} disabled={busy} focusableWhenDisabled aria-busy={busy}>
            {busy && <Spinner aria-hidden className="size-[18px]" />}
            Scan ID and take selfie
          </Button>
          <Button variant="ghost" size="sm" onClick={() => verify(true)} disabled={busy} className="text-black/40">
            Simulate someone else
          </Button>
        </div>
        {errorLine}
      </div>
    );

  if (stage.name === "kit" || stage.name === "restoring") {
    const restoring = stage.name === "restoring";
    return (
      <div key="kit" className="flex w-full max-w-[310px] flex-col items-center text-center">
        <h1 className={title}>{restoring ? "Restoring your wallet" : "Enter your Recovery Kit"}</h1>
        <p className={body}>
          {restoring
            ? "A new Device Key for this phone, a key ceremony with Swissquote and the partner, then the recovery goes on-chain."
            : "The kit you saved when you created your wallet. It confirms the recovery from home."}
        </p>
        <textarea
          value={kit}
          onChange={(e) => setKit(e.target.value)}
          readOnly={busy}
          aria-label="Recovery Kit"
          placeholder="Recovery key: 0x…"
          rows={4}
          spellCheck={false}
          className={`${enter} mt-6 w-full resize-none rounded-[18px] bg-white p-4 font-mono text-[12px] leading-[17px] break-all shadow-[0_0_0_1px_rgb(0_0_0/0.06)] outline-none placeholder:text-black/30 focus:shadow-[0_0_0_1px_rgb(0_0_0/0.14)]`}
        />
        <div className={`${actions} w-full`}>
          <Button onClick={restore} disabled={busy || !kit.trim()} focusableWhenDisabled aria-busy={busy} className={!busy && !kit.trim() ? "opacity-35" : ""}>
            {busy && <Spinner aria-hidden className="size-[18px]" />}
            {restoring ? "Restoring" : "Restore with Face ID"}
          </Button>
          <label className="relative inline-flex h-[34px] cursor-pointer items-center justify-center rounded-full text-[14px] font-medium text-black/40 transition-colors hover:bg-black/[0.04] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-fuse-blue">
            Choose file
            <input
              type="file"
              accept=".txt,text/plain"
              disabled={busy}
              onChange={async (e) => setKit((await e.target.files?.[0]?.text()) ?? kit)}
              className="sr-only"
            />
          </label>
        </div>
        {errorLine}
      </div>
    );
  }

  if (stage.name === "waiting") {
    const left = Math.max(0, Math.ceil(stage.executeAfter + CHAIN_LAG - now));
    return (
      <div key="waiting" className="flex flex-col items-center text-center">
        <p className={`${enter} text-[48px] leading-[56px] font-bold tracking-[-0.035em] tabular-nums`} aria-live="off">
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </p>
        <h1 className={title}>Your wallet will be restored on {restoreDate(stage.executeAfter)}</h1>
        <p className={body}>We alerted all your devices. If this wasn&apos;t you, cancel the recovery now.</p>
        <div className={actions}>
          <Button onClick={finalize} disabled={busy || left > 0} aria-busy={busy}>
            {busy && <Spinner aria-hidden className="size-[18px]" />}
            Finish recovery
          </Button>
          <Button variant="ghost" size="sm" onClick={cancel} disabled={busy} className="text-negative">
            Cancel recovery
          </Button>
        </div>
        {errorLine}
      </div>
    );
  }

  return (
    <div key="done" className="flex flex-col items-center text-center">
      <CheckCircleIcon weight="fill" size={56} aria-hidden className={`${enter} text-positive`} />
      <h1 className={title}>Welcome back</h1>
      <p className={body}>Same address, same balance. This phone now holds your new Device Key.</p>
      <div className={actions}>
        <Button onClick={() => router.replace("/home", { transitionTypes: ["push"] })}>Open wallet</Button>
      </div>
    </div>
  );
}
