"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits, type Hex } from "viem";
import { refreshWallet, useWallet, type WalletSnapshot } from "@/app/(tabs)/_components/wallet";
import { BankIcon, CheckIcon, FaceIdIcon, LightningIcon, WarningIcon } from "@/components/icons";
import { useBack } from "@/components/navigation";
import { BackButton } from "@/components/ui/back-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ComplianceDecision } from "@/lib/compliance/types";
import { buildVaultCall, decisionAllowsSigning, needsApproval, parseVaultAmount, type DappCatalog, type VaultAction, type VaultDapp, type VaultQuote, type VaultSnapshot, type VaultStep } from "@/lib/dapps/model";
import { ApiError, phone, type Prepared } from "@/lib/wallet/phone";

const units = (amount: string, decimals: number) => formatUnits(BigInt(amount), decimals);
const labels: Record<VaultStep, string> = { approve: "Approve amount", deposit: "Deposit", withdraw: "Withdraw", revoke: "Revoke permission" };
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const message = (error: unknown) => error instanceof Error ? error.message : "The request failed. Please retry.";

function walletBlocker(wallet: WalletSnapshot): string | undefined {
  if (wallet.status === "loading") return "Loading your wallet…";
  if (wallet.status === "none") return "Create or recover a wallet before interacting with a dApp.";
  if (wallet.status === "missing") return "This wallet is not registered on the current network.";
  if (wallet.status === "offline") return "Your wallet backend is unavailable. Retry when it is back.";
  if (wallet.status === "ready" && !wallet.wallet.controls) return "This phone cannot sign for the wallet. Finish recovery or use the current phone.";
}

export function DappsScreen() {
  const back = useBack("/home");
  const wallet = useWallet();
  const [catalog, setCatalog] = useState<DappCatalog>();
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const next = await phone.dapps();
      setCatalog(next);
      setSelected((current) => next.vaults.some((vault) => vault.address === current) ? current : next.vaults[0]?.address);
    } catch (e) {
      setCatalog(undefined);
      setError(message(e));
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const vault = catalog?.vaults.find((item) => item.address === selected);

  return (
    <main className="min-h-dvh bg-white pt-[env(safe-area-inset-top)] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-6 pt-5">
        <BackButton onClick={back} disabled={busy} />
        <h1 className="text-heading">Reviewed dApps</h1>
        <Button variant="ghost" size="sm" className="ml-auto" disabled={loading || busy} onClick={load}>Refresh</Button>
      </header>
      <div className="mx-auto max-w-5xl px-6 pt-7">
        <p className="max-w-xl text-body text-muted-foreground">Use policy-listed vaults with your wallet. Swissquote checks each call and sponsors only the operations it allows.</p>
        {catalog && <p className="mt-4 rounded-2xl bg-secondary p-4 text-caption" role="status">
          {catalog.mode === "demo" ? "Demo checks · screening and simulation use fixtures, not live compliance evidence. The local test vault earns no yield." : "Live-provider mode · assistance still depends on available evidence. A registry listing is not a legal certification or a guarantee of safety."}
          <span className="mt-1 block text-muted-foreground">Network {catalog.chainId} · Policy {catalog.policyVersion}</span>
        </p>}
        {loading && <p role="status" className="mt-8 flex items-center gap-2 text-body"><Spinner aria-hidden /> Loading reviewed dApps…</p>}
        {error && <p role="alert" className="mt-6 text-body text-negative">{error} Start the wallet stack or retry Refresh.</p>}
        {catalog?.vaults.length === 0 && <section className="mt-8 rounded-3xl border border-border p-6">
          <h2 className="text-label">No reviewed vaults on this network</h2>
          <p className="mt-2 text-body text-muted-foreground">A deployed ERC-4626 vault and its token permissions must be in the server policy. A fresh local deployment includes the test vault; existing chains need an explicit policy update.</p>
        </section>}
        {!!catalog?.vaults.length && <div className="mt-7 grid items-start gap-6 md:grid-cols-[16rem_minmax(0,1fr)]">
          <nav aria-label="Reviewed vaults" className="space-y-3">
            {catalog.vaults.map((item) => <button key={item.address} disabled={busy} onClick={() => setSelected(item.address)} aria-pressed={selected === item.address}
              className={`w-full rounded-3xl border p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-brand ${selected === item.address ? "border-brand bg-brand/5" : "border-border bg-surface"}`}>
              <span className="mb-3 grid size-10 place-items-center rounded-2xl bg-brand/10 text-brand"><BankIcon size={23} /></span>
              <span className="block text-label">{item.name}</span>
              <span className="mt-1 block text-caption text-muted-foreground">{item.asset.symbol} · ERC-4626</span>
              <span className={`mt-3 block text-caption ${item.available ? "text-positive" : "text-pending"}`}>{item.available ? "Listed by policy" : "Unavailable"}</span>
            </button>)}
          </nav>
          {vault && <VaultPanel key={`${vault.address}:${wallet.status === "ready" ? wallet.wallet.address : wallet.status}`} vault={vault} wallet={wallet} onBusyChange={setBusy} />}
        </div>}
      </div>
    </main>
  );
}

function VaultPanel({ vault, wallet, onBusyChange }: { vault: VaultDapp; wallet: WalletSnapshot; onBusyChange: (busy: boolean) => void }) {
  const [snapshot, setSnapshot] = useState<VaultSnapshot>();
  const [action, setAction] = useState<VaultAction>(vault.actions.includes("deposit") ? "deposit" : vault.actions[0] ?? "withdraw");
  const [amount, setAmount] = useState("25");
  const [phase, setPhase] = useState<"edit" | "checking" | "review" | "signing" | "done">("edit");
  const [quote, setQuote] = useState<VaultQuote>();
  const [step, setStep] = useState<VaultStep>(action);
  const [prepared, setPrepared] = useState<Prepared>();
  const [review, setReview] = useState<ComplianceDecision>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [receipts, setReceipts] = useState<Array<{ step: VaultStep; hash: Hex }>>([]);
  const [now, setNow] = useState(Date.now());
  const blocked = !vault.available ? vault.unavailableReason ?? "This vault is unavailable." : walletBlocker(wallet);
  const busy = phase === "checking" || phase === "signing";
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);

  async function refresh(afterTx?: Hex) {
    if (wallet.status !== "ready" || !vault.available) return;
    try { setSnapshot(await phone.vaultSnapshot(vault.address, afterTx)); }
    catch (e) { setSnapshot(undefined); setError(message(e)); }
  }
  useEffect(() => { void refresh(); }, [vault.address, vault.available, wallet.status]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  function reset() { setPhase("edit"); setQuote(undefined); setPrepared(undefined); setReview(undefined); setError(""); }
  function failed(e: unknown) {
    setPrepared(undefined);
    setPhase("edit");
    setError(message(e));
    setReview(e instanceof ApiError ? e.body.review as ComplianceDecision | undefined : undefined);
  }
  async function check() {
    if (blocked || wallet.status !== "ready") return;
    setPhase("checking"); setError(""); setPrepared(undefined); setReview(undefined);
    try {
      const baseUnits = action === "revoke" ? 0n : parseVaultAmount(amount, vault.asset.decimals);
      const next = await phone.quoteVault(vault.address, action, baseUnits);
      // A quote never chooses what the phone signs: this adapter rebuilds the client's intent locally.
      if (next.action !== action || next.amount !== baseUnits.toString()) throw new Error("The backend returned a different preview than requested.");
      setQuote(next); setSnapshot(next.snapshot);
      const nextStep = needsApproval(next) ? "approve" : action;
      setStep(nextStep);
      const operation = await phone.prepare(buildVaultCall(vault, wallet.wallet.address, nextStep, baseUnits), { origin: vault.origin, name: vault.name });
      if (!operation.review) throw new Error("The wallet backend returned no compliance review. Do not sign.");
      setPrepared(operation); setReview(operation.review); setNow(Date.now()); setPhase("review");
    } catch (e) { failed(e); }
  }
  const deadline = Math.min(Date.parse(prepared?.expiresAt ?? ""), Date.parse(review?.expiresAt ?? ""));
  const expired = !!prepared && (!Number.isFinite(deadline) || deadline <= now);
  const canSign = !!prepared && !!quote && !blocked && !expired && decisionAllowsSigning(review, now);

  async function sign() {
    if (!canSign || !prepared || deadline <= Date.now() || !decisionAllowsSigning(review)) return;
    setPhase("signing"); setError("");
    try {
      const hash = await phone.approve(prepared);
      setReceipts((previous) => [...previous, { step, hash }]);
      setPrepared(undefined); setReview(undefined); setQuote(undefined);
      await Promise.all([refresh(hash), refreshWallet()]);
      if (step === "approve") {
        setNotice("Permission granted, but no deposit has been sent. Check the deposit again for a fresh review and passkey approval. If you stop here, revoke the remaining permission.");
        setPhase("edit");
      } else {
        setNotice(`${labels[step]} confirmed on-chain. Swissquote paid the network fee.`);
        setPhase("done");
      }
    } catch (e) { failed(e); await refresh(); }
  }

  return <section aria-label="Vault interaction" className="rounded-3xl border border-border p-5 sm:p-6">
    <h2 className="text-heading">{vault.name}</h2>
    <p className="mt-2 break-all text-caption text-muted-foreground">Contract {vault.address}</p>
    <p className="mt-1 break-all text-caption text-muted-foreground">Listed origin: {vault.origin || "Not configured"} · not website authentication</p>
    <div className="mt-5 grid grid-cols-2 gap-3">
      <div className="rounded-2xl bg-secondary p-4"><p className="text-caption text-muted-foreground">Wallet balance</p><p className="mt-1 text-label">{snapshot ? units(snapshot.assetBalance, vault.asset.decimals) : "—"} {vault.asset.symbol}</p></div>
      <div className="rounded-2xl bg-secondary p-4"><p className="text-caption text-muted-foreground">In this vault</p><p className="mt-1 text-label">{snapshot ? units(snapshot.assetValue, vault.asset.decimals) : "—"} {vault.asset.symbol}</p></div>
    </div>
    {snapshot && <p className="mt-3 text-caption text-muted-foreground">Remaining spending permission: {units(snapshot.allowance, vault.asset.decimals)} {vault.asset.symbol}</p>}
    {blocked && <p role="status" className="mt-4 text-body text-pending">{blocked}</p>}
    {wallet.status === "none" && <Link href="/onboarding-welcome" className={buttonVariants({ size: "sm", className: "mt-3" })}>Set up wallet</Link>}
    {vault.available && <>
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Vault action">
        {vault.actions.map((item) => <Button key={item} size="sm" variant={action === item ? "default" : "secondary"} aria-pressed={action === item} disabled={busy} onClick={() => { reset(); setAction(item); setNotice(""); }}>{labels[item]}</Button>)}
      </div>
      {action !== "revoke" && <label className="mt-6 block text-body">Amount in {vault.asset.symbol}
        <input aria-label={`Vault amount in ${vault.asset.symbol}`} value={amount} inputMode="decimal" disabled={busy}
          onChange={(event) => { reset(); setAmount(event.target.value.replace(",", ".")); }}
          className="mt-2 block w-full rounded-2xl border border-input px-4 py-3 text-heading outline-none focus:border-brand" />
      </label>}
      <p className="mt-4 flex items-center gap-2 text-caption text-positive"><LightningIcon size={16} /> Approved operations: network fee paid by Swissquote</p>
      <p className="mt-3 text-caption text-muted-foreground">Deposits may require two separate transactions and passkey approvals. Permission can remain if the deposit fails or you cancel. Vault previews are indicative, with no minimum-output protection. No yield or capital protection is promised.</p>
      {notice && <p role="status" className="mt-4 rounded-2xl bg-brand/5 p-4 text-body">{notice}</p>}
      {quote && <div className="mt-5 rounded-2xl bg-secondary p-4 text-body">
        <p className="text-label">{labels[step]} · {action === "revoke" ? "set permission to zero" : `${units(quote.amount, vault.asset.decimals)} ${vault.asset.symbol}`}</p>
        {action !== "revoke" && <p className="mt-2 text-caption text-muted-foreground">Estimated shares {action === "deposit" ? "received" : "burned"}: {units(quote.expectedOutput, vault.shares.decimals)} {vault.shares.symbol}. Assets and shares stay with your wallet.</p>}
      </div>}
      {review && <ComplianceReview decision={review} />}
      {error && <p role="alert" className="mt-4 text-body text-negative">{error}</p>}
      {expired && <p role="alert" className="mt-4 text-body text-pending">This review expired. Check the transaction again before signing.</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        {phase === "review" && !expired ? <Button disabled={!canSign} onClick={sign}><FaceIdIcon size={18} />{labels[step]} with passkey</Button>
          : phase === "done" ? <Button onClick={reset}>New transaction</Button>
          : <Button disabled={!!blocked || busy} onClick={check}>{busy && <Spinner aria-hidden />}{phase === "signing" ? "Confirming on-chain…" : phase === "checking" ? "Checking transaction…" : "Check transaction"}</Button>}
        <Button variant="secondary" disabled={busy} onClick={() => { reset(); void refresh(); }}>Refresh balances</Button>
      </div>
    </>}
    {!!receipts.length && <section aria-label="Confirmed dApp transactions" className="mt-6 border-t border-border pt-5">
      <h3 className="text-label">Confirmed on-chain</h3>
      {receipts.map((receipt) => <div key={receipt.hash} className="mt-3 text-caption"><p className="flex items-center gap-2"><CheckIcon size={15} />{labels[receipt.step]}</p><p className="mt-1 break-all font-mono text-muted-foreground">{receipt.hash}</p></div>)}
    </section>}
  </section>;
}

function ComplianceReview({ decision }: { decision: ComplianceDecision }) {
  const allowed = decision.status === "ALLOW";
  const status: Record<ComplianceDecision["status"], string> = { ALLOW: "Policy allows sponsorship", STEP_UP: "Additional verification required", REVIEW: "Review required", DENY_ASSISTANCE: "Swissquote assistance refused" };
  return <section aria-label="Compliance review" className="mt-5 rounded-2xl border border-border p-4">
    <h3 className={`flex items-center gap-2 text-label ${allowed ? "text-positive" : "text-pending"}`}>{allowed ? <CheckIcon size={18} /> : <WarningIcon size={18} />}{status[decision.status]}</h3>
    <p className="mt-2 text-caption text-muted-foreground">{decision.assurance === "DEMO" ? "Demo evidence" : "Live-provider evidence"} · Risk {decision.riskLevel.toLowerCase()}</p>
    <ul className="mt-3 space-y-2 text-body">{decision.summary.map((line, index) => <li key={index}>{line}</li>)}</ul>
    {!allowed && <>
      <ul className="mt-3 space-y-2 text-caption text-negative">{decision.reasons.map((reason, index) => <li key={index}>{reason.message}</li>)}</ul>
      <p className="mt-3 text-caption">No passkey request or transaction submission. This build has no additional-verification or manual-review workflow.</p>
    </>}
    <details className="mt-4 text-caption">
      <summary className="cursor-pointer text-muted-foreground">Checks and limitations</summary>
      <dl className="mt-3 space-y-2">
        <div><dt>Simulation</dt><dd>{decision.simulation.status} · {decision.simulation.provider} · call-intent only</dd></div>
        <div><dt>Sanctions screening</dt><dd>{decision.screening.length ? `${decision.screening.length} addresses checked; ${decision.screening.filter((item) => item.status === "CLEAR").length} clear results` : "No evidence"}</dd></div>
        <div><dt>Expected asset changes</dt><dd>{decision.simulation.assetChanges.length ? decision.simulation.assetChanges.map((change) => `${change.symbol ?? short(change.asset)}: ${change.decimals === undefined ? change.amount + " base units" : units(change.amount, change.decimals)}`).join("; ") : "No asset changes reported"}</dd></div>
        <div><dt>Decision</dt><dd className="break-all">{decision.decisionId} · Policy {decision.policyVersion}</dd></div>
        <div><dt>Expires</dt><dd>{new Date(decision.expiresAt).toLocaleTimeString()}</dd></div>
      </dl>
      <ul className="mt-3 space-y-2 text-muted-foreground">{decision.limitations.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </details>
  </section>;
}
