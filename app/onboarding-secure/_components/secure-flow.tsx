"use client";

import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, useState } from "react";
import type { Address } from "viem";
import { blurred, sharp, smooth } from "@/app/(tabs)/_components/transitions";
import { BackButton } from "@/components/ui/back-button";
import { buttonVariants } from "@/components/ui/button";
import { api, ApiError, createDeviceKey, keyCeremony, registerWallet, type DeviceKey } from "@/lib/wallet/browser";
import { KEYS } from "../data";
import { flowReducer, initialFlow, keyState, pendingTimer, toneOf } from "../flow";
import { CodeEntry } from "./code-entry";
import { CreateButton } from "./create-button";
import { EmailForm } from "./email-form";
import { GlimmBackdrop } from "./glimm-backdrop";
import { KeyItem, SetupRow } from "./key-list";
import { blurSwap } from "./motion";

// Content waits for the entry flood to clear before it blurs in.
const entrance = (delay: number) => ({
  initial: { opacity: 0, filter: blurred, y: 16 },
  animate: { opacity: 1, filter: sharp, y: 0 },
  transition: { ...smooth, delay, layout: smooth },
});

export function SecureFlow() {
  const router = useRouter();
  const [step, dispatch] = useReducer(flowReducer, initialFlow);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState("");
  const device = useRef<DeviceKey>(null);
  const signer = useRef<Address>(null);
  const registration = useRef<ReturnType<typeof registerWallet>>(null);
  const [wallet, setWallet] = useState<Awaited<ReturnType<typeof registerWallet>>>();

  useEffect(() => {
    const timer = pendingTimer(step);
    if (!timer) return;
    const id = setTimeout(() => dispatch(timer.action), timer.ms);
    return () => clearTimeout(id);
  }, [step]);

  // Device Key: Face ID creates the passkey. Swissquote Key: the 2-of-3 key ceremony with Swissquote and the partner.
  async function create() {
    if (step.name !== "device" && step.name !== "twofa") return;
    dispatch({ type: "create" });
    setError("");
    try {
      if (step.name === "device") {
        await api("GET", "/api/wallet").then(
          () => Promise.reject(new Error("You already have a wallet. Recover it instead.")),
          (e) => (e instanceof ApiError && e.status === 404 ? undefined : Promise.reject(e)),
        );
        device.current = await createDeviceKey();
      } else {
        signer.current = await keyCeremony(device.current!, "create");
      }
      dispatch({ type: "created" });
    } catch (e) {
      setError((e as Error).message);
      dispatch({ type: "failed" });
    }
  }

  // Setup registers the wallet with a new Recovery Kit. The ref owns the request, so Strict Mode's second run reuses it.
  const working = step.name === "setup" && step.status === "working";
  useEffect(() => {
    if (!working) return;
    registration.current ??= registerWallet(signer.current!, device.current!.passkey);
    registration.current.then(
      (w) => {
        setWallet(w);
        dispatch({ type: "walletReady" });
      },
      (e: Error) => setError(e.message),
    );
  }, [working]);

  const ready = step.name === "setup" && step.status === "ready";

  // While the keyboard is up the content lifts above it and the gradient steps aside.
  // From sm the band is a 50svh strip, so the list starts in its fade (24svh, less the 60px header) instead of the bottom.
  const lifted = typing && step.name === "recovery" && (step.status === "email" || step.status === "code");
  const setup = step.name === "setup";
  const onGradient = !lifted && !setup;
  const current = KEYS.find((k) => k.id === step.name);

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <GlimmBackdrop tone={toneOf(step)} visible={!lifted} />

        <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col">
          <motion.header
            animate={{ opacity: setup ? 0 : 1 }}
            transition={smooth}
            inert={setup}
            className={`flex items-start justify-between px-[46px] pt-[calc(env(safe-area-inset-top)+24px)] transition-colors duration-300 ${
              onGradient ? "text-white" : "text-black/40"
            }`}
          >
            <h1 className="text-[15px] leading-[18px] font-medium">
              Secure
              <br />
              your wallet
            </h1>
            <BackButton kind="close" tone={onGradient ? "dark" : "light"} fallback="/onboarding-welcome" className="-mt-[9px] -mr-[10px]" />
          </motion.header>

          <div
            className={`flex flex-1 flex-col px-[30px] ${
              setup
                ? "justify-center pb-24"
                : `pb-[max(calc(env(safe-area-inset-bottom)+12px),36px)] ${lifted ? "justify-start pt-16" : "justify-end sm:justify-start sm:pt-[calc(24svh-60px)]"}`
            }`}
          >
            <motion.ul {...entrance(0.9)} className="relative flex flex-col">
              <AnimatePresence mode="popLayout" initial={false}>
                {KEYS.map((item) => {
                  const state = keyState(step, item.id);
                  if (lifted && state === "done") return null;
                  const recovery = step.name === "recovery" && item.id === "recovery" ? step : null;
                  const sent = recovery && (recovery.status === "code" || recovery.status === "verifying");
                  return (
                    <KeyItem
                      key={item.id}
                      item={item}
                      active={state === "active"}
                      sentTo={sent ? recovery.email : undefined}
                    >
                      {sent && (
                        <CodeEntry
                          verifying={recovery.status === "verifying"}
                          onComplete={() => dispatch({ type: "verify" })}
                          onFocusChange={setTyping}
                        />
                      )}
                    </KeyItem>
                  );
                })}
                {setup && <SetupRow key="setup" ready={ready} address={wallet?.address} />}
              </AnimatePresence>
            </motion.ul>

            <motion.div layout="position" {...entrance(1)} className="relative mt-7">
              <AnimatePresence mode="popLayout" initial={false}>
                {(step.name === "device" || step.name === "twofa") && current && (
                  <motion.div key="create" {...blurSwap}>
                    <CreateButton
                      item={current}
                      busy={step.status === "creating"}
                      onPress={create}
                    />
                  </motion.div>
                )}
                {step.name === "recovery" && (step.status === "email" || step.status === "sending") && (
                  <motion.div key="email" {...blurSwap}>
                    <EmailForm
                      sending={step.status === "sending"}
                      onSubmit={(email) => dispatch({ type: "sendCode", email })}
                      onFocusChange={setTyping}
                    />
                  </motion.div>
                )}
                {ready && wallet && (
                  <motion.div key="kit" {...blurSwap}>
                    {/* The kit is the only copy of the confirmation key: it leaves the browser and is never stored here. */}
                    <a
                      href={`data:text/plain;charset=utf-8,${encodeURIComponent(wallet.kit)}`}
                      download="swissquote-recovery-kit.txt"
                      onClick={() => router.replace("/home", { transitionTypes: ["push"] })}
                      className={buttonVariants({ size: "lg", className: "w-full" })}
                    >
                      <DownloadSimpleIcon weight="bold" size={20} aria-hidden />
                      Save Recovery Kit
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>
              <p aria-live="polite" className="mt-3 px-4 text-[13px] leading-[18px] text-negative first-letter:uppercase empty:hidden">
                {error}
              </p>
            </motion.div>
          </div>
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
