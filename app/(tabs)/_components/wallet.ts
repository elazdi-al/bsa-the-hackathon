"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { formatUnits, isAddressEqual, type Address } from "viem";
import { ApiError, phone, type HeldPayment, type Transfer } from "@/lib/wallet/phone";

export type Wallet = {
  address: Address;
  /** USDC, in dollars. */
  usdc: number;
  /** This phone's key is the wallet key. False on a new phone mid-recovery, and on an old phone once a recovery finished elsewhere. */
  controls: boolean;
  /** Swissquote locked this phone after it was reported lost. Only ever true on the phone that controls the wallet. */
  locked: boolean;
  /**
   * The recovery waiting out its 48 hours; `mine` when this phone started it. `oldPhoneLocked`: Swissquote locked the
   * phone this recovery replaces, the one that holds the wallet now.
   */
  recovery: { executeAfter: number; mine: boolean; oldPhoneLocked: boolean } | null;
  /** Chain time minus this phone's clock, in seconds: a local chain can be warped ahead. */
  skew: number;
  /** This phone started a recovery that hasn't handed it the wallet: one still running, or one called off. */
  restoring: boolean;
  /** The Swissquote client number the wallet key signed the wallet belongs to, kept by Swissquote; null if none. */
  owner: string | null;
  /** Large payments Swissquote holds before they leave, soonest first. */
  held: HeldPayment[];
  /** USDC in and out, newest first, once a screen asked for it with `useActivity`. */
  activity?: Transfer[];
};

/**
 * `none`: this phone has no wallet. `missing`: Swissquote doesn't know this phone's wallet, as after the
 * local chain was reset. `offline`: the first read failed; a later failure keeps the last good wallet.
 */
export type WalletSnapshot = { status: "loading" | "none" | "missing" | "offline" } | { status: "ready"; wallet: Wallet };

const POLL_MS = 4000;
const LOADING: WalletSnapshot = { status: "loading" };

let snapshot: WalletSnapshot = LOADING;
const listeners = new Set<() => void>();
let wantsActivity = 0;
// Set by forgetWallet: screens still up keep the removed wallet while they leave, and the next screen starts fresh.
let forgotten = false;
const getSnapshot = () => (forgotten && !listeners.size ? LOADING : snapshot);

function publish(next: WalletSnapshot) {
  if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

async function load() {
  if (!phone.hasWallet()) return forgotten ? undefined : publish({ status: "none" });
  try {
    const [state, activity] = await Promise.all([phone.state(), wantsActivity ? phone.activity().catch(() => undefined) : undefined]);
    const device = phone.device()!;
    const mine = device.signer;
    const controls = isAddressEqual(mine, state.signer);
    const last = snapshot.status === "ready" ? snapshot.wallet : undefined;
    const skew = Math.round(state.chainTime - Date.now() / 1000);
    publish({
      status: "ready",
      wallet: {
        address: state.address,
        usdc: Number(formatUnits(BigInt(state.usdc), 6)),
        controls,
        locked: controls && state.locked,
        recovery: state.pendingRecovery && {
          executeAfter: state.pendingRecovery.executeAfter,
          mine: isAddressEqual(mine, state.pendingRecovery.signer),
          oldPhoneLocked: state.locked,
        },
        // The chain reports whole seconds against a fractional clock, so a jitter of a second or two isn't news.
        skew: last && Math.abs(last.skew - skew) <= 2 ? last.skew : skew,
        activity: activity ?? last?.activity,
        restoring: !controls && !!device.restoring,
        owner: state.owner?.client ?? null,
        held: state.held,
      },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) publish({ status: "missing" });
    else if (snapshot.status !== "ready") publish({ status: "offline" });
  }
}

let running: Promise<void> = Promise.resolve();
let queued: Promise<void> | undefined;

/** Reads the wallet again. One read at a time; asked mid-read, it reads once more after, so it never resolves to stale data. */
export function refreshWallet(): Promise<void> {
  queued ??= running.then(() => {
    queued = undefined;
    return (running = load());
  });
  return queued;
}

function subscribe(listener: () => void) {
  if (forgotten && !listeners.size) {
    forgotten = false;
    snapshot = LOADING;
  }
  listeners.add(listener);
  if (listeners.size === 1) startPolling();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) stopPolling();
  };
}

let stopPolling = () => {};

// While anything shows the wallet: read now, every few seconds while visible, and on coming back to the app,
// so a payment from elsewhere, a recovery someone started, or a warped chain shows up without a reload.
function startPolling() {
  const tick = () => {
    if (document.visibilityState === "visible") refreshWallet();
  };
  refreshWallet();
  const id = setInterval(tick, POLL_MS);
  window.addEventListener("focus", tick);
  document.addEventListener("visibilitychange", tick);
  stopPolling = () => {
    clearInterval(id);
    window.removeEventListener("focus", tick);
    document.removeEventListener("visibilitychange", tick);
  };
}

/** This phone's wallet, shared by every screen and kept fresh while one is mounted. */
export function useWallet(): WalletSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => LOADING);
}

/** The wallet's USDC transfers; undefined until read, or with no live wallet. */
export function useActivity(): Transfer[] | undefined {
  useEffect(() => {
    wantsActivity++;
    refreshWallet();
    return () => {
      wantsActivity--;
    };
  }, []);
  const wallet = useWallet();
  return wallet.status === "ready" ? wallet.wallet.activity : undefined;
}

/** Chain time now, in seconds, for a wallet read at some point: what the 48-hour hold is measured in. */
export const chainNow = (wallet: Pick<Wallet, "skew">) => Date.now() / 1000 + wallet.skew;

/** A chain timestamp in seconds as a moment on this phone's clock, which a warped local chain runs ahead of. */
export const onPhoneClock = (wallet: Pick<Wallet, "skew">, chainSeconds: number) => new Date((chainSeconds - wallet.skew) * 1000);

/** A chain timestamp as a day and time on this phone, as in "12 October at 14:03". */
export const phoneDate = (wallet: Pick<Wallet, "skew">, chainSeconds: number) =>
  onPhoneClock(wallet, chainSeconds).toLocaleString("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** The wallet's address once read. */
export const shownAddress = (snapshot: WalletSnapshot) => (snapshot.status === "ready" ? snapshot.wallet.address : undefined);

/** Sends a phone with no wallet to onboarding. Every screen that shows the wallet renders one. */
export function RequireWallet() {
  const router = useRouter();
  const none = useWallet().status === "none";
  useEffect(() => {
    if (none) router.replace("/onboarding-welcome");
  }, [none, router]);
  return null;
}

/** Removes the wallet from this phone. Navigate away right after; the screens leaving keep showing it until they're gone. */
export function forgetWallet() {
  phone.forget();
  forgotten = true;
}
