"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef } from "react";
import type { Hex } from "viem";
import { signedIn, useSignedIn } from "@/app/(tabs)/_components/session";
import { blurred, sharp, smooth } from "@/app/(tabs)/_components/transitions";
import { CheckIcon } from "@/components/icons";
import { SwissquoteMark } from "@/components/swissquote-mark";
import { Button } from "@/components/ui/button";
import { phone, RECOVERY_FILE } from "@/lib/wallet/phone";
import { FAILED, KEYS, SAVED, SETUP } from "../data";
import { flowReducer, initialFlow, keyState, pendingTimer, toneOf, type Keys } from "../flow";
import { CreateButton } from "./create-button";
import { GlimmBackdrop } from "./glimm-backdrop";
import { Holders } from "./holders";
import { KeyItem, SetupRow } from "./key-list";
import { blurSwap, layoutSpring } from "./motion";

// Content waits for the entry flood to clear before it blurs in.
const entrance = (delay: number) => ({
  initial: { opacity: 0, filter: blurred, y: 16 },
  animate: { opacity: 1, filter: sharp, y: 0 },
  transition: { ...smooth, delay, layout: layoutSpring },
});

/** Hands the Recovery Key to the share sheet, or downloads it where files can't be shared. */
function saveRecoveryKey(secret: Hex): Promise<void> {
  const file = new File([RECOVERY_FILE.text(secret)], RECOVERY_FILE.name, { type: "text/plain" });
  if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file] });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  // Revoking in the same task can cancel the download before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return Promise.resolve();
}

export function SecureFlow() {
  const router = useRouter();
  const client = useSignedIn()?.client;
  const [step, dispatch] = useReducer(flowReducer, initialFlow);
  // Set in the same tick as the tap, so a double tap can't open two passkey prompts before React re-renders.
  const pressing = useRef(false);

  // Splitting a new key here would overwrite the Share A of the wallet this phone already holds.
  useEffect(() => {
    if (phone.hasWallet()) router.replace("/home");
  }, [router]);

  useEffect(() => {
    const timer = pendingTimer(step);
    if (!timer) return;
    const id = setTimeout(() => dispatch(timer.action), timer.ms);
    return () => clearTimeout(id);
  }, [step]);

  const ready = step.name === "setup" && step.status === "ready";
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => router.replace("/home", { transitionTypes: ["push"] }), 1600);
    return () => clearTimeout(id);
  }, [ready, router]);

  const register = async (keys: Keys) => {
    const address = await signedIn()
      .then((session) => phone.register(keys.recoveryKey, session))
      .catch(() => null);
    dispatch(address ? { type: "registered", address } : { type: "failed", error: FAILED.setup });
  };

  // All work starts in the click, never in an effect: WebAuthn and the share sheet need the click's user
  // activation, so nothing may await before them, and React runs effects twice in development.
  const press = async () => {
    if (step.status !== "idle" || pressing.current) return;
    pressing.current = true;
    try {
      dispatch({ type: "start" });
      switch (step.name) {
        case "passkey": {
          const credential = await phone.createPasskey().catch(() => null);
          return dispatch(credential ? { type: "passkeyCreated", credential } : { type: "failed", error: FAILED.passkey });
        }
        case "key": {
          const signer = await phone.splitKey(step.keys.credential).catch(() => null);
          return dispatch(signer ? { type: "keySplit", signer } : { type: "failed", error: FAILED.key });
        }
        case "recovery": {
          const { secret, address } = phone.createRecoveryKey();
          try {
            await saveRecoveryKey(secret);
          } catch (error) {
            const closed = error instanceof DOMException && error.name === "AbortError";
            return dispatch(closed ? { type: "cancelled" } : { type: "failed", error: FAILED.recovery });
          }
          return dispatch({ type: "recoverySaved", recoveryKey: address, secret });
        }
        case "setup":
          return register(step.keys);
      }
    } finally {
      pressing.current = false;
    }
  };

  const confirmSaved = async (keys: Keys) => {
    if (pressing.current) return;
    pressing.current = true;
    dispatch({ type: "advance" });
    await register(keys);
    pressing.current = false;
  };

  const setup = step.name === "setup";
  const saved = step.name === "recovery" && step.status === "saved";
  const current = KEYS.find((k) => k.id === step.name);

  // No LayoutGroup: when an exit finishes, AnimatePresence re-renders its whole group, which restarts every
  // layout spring mid-move. Every layout change here comes from this component's own renders anyway.
  return (
    <MotionConfig reducedMotion="user">
      <GlimmBackdrop tone={toneOf(step)} />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col">
        {/* From sm the band is a 50svh strip, so the list starts in its fade (24svh) instead of the bottom. */}
        <div
          className={`flex flex-1 flex-col px-[30px] ${
            setup
              ? "justify-center pb-24"
              : "justify-end pt-[env(safe-area-inset-top)] pb-[max(calc(env(safe-area-inset-bottom)+12px),36px)] sm:justify-start sm:pt-[24svh]"
          }`}
        >
          {/* Holds its line while the sign-in resolves, so the list below never jumps. */}
          <motion.p layout="position" {...entrance(0.85)} className="mb-4 px-4 text-caption text-muted-foreground">
            <span className={`flex items-center gap-2 transition-opacity duration-200 ease-out ${client ? "" : "opacity-0"}`}>
              <SwissquoteMark size={16} className="shrink-0" />
              <span className="truncate">
                Signed in to Swissquote as <span className="text-foreground">{client?.name ?? "\u00a0"}</span> · Mock
              </span>
            </span>
          </motion.p>

          <motion.ul {...entrance(0.9)} className="relative flex flex-col">
            <AnimatePresence mode="popLayout" initial={false}>
              {KEYS.map((item) => (
                <KeyItem key={item.id} item={item} state={keyState(step, item.id)}>
                  {item.id === "key" && <Holders status={step.name === "key" ? step.status : "idle"} />}
                </KeyItem>
              ))}
              {step.name === "setup" && <SetupRow key="setup" step={step} />}
            </AnimatePresence>
          </motion.ul>

          <motion.div layout="position" {...entrance(1)} className="relative mt-7">
            <AnimatePresence mode="popLayout" initial={false}>
              {current && (
                <motion.div key="create" {...blurSwap}>
                  {saved ? (
                    <CreateButton
                      label={SAVED.cta}
                      Icon={CheckIcon}
                      accent={current.accent}
                      busy={false}
                      // Without a share sheet the file saves at once, so the second click of a double click lands here.
                      onPress={(event) => event.detail < 2 && confirmSaved(step.keys)}
                    />
                  ) : (
                    <CreateButton
                      label={step.status === "idle" ? current.cta.idle : current.cta.busy}
                      Icon={current.Icon}
                      accent={current.accent}
                      busy={step.status !== "idle"}
                      error={step.status === "idle" ? step.error : undefined}
                      onPress={press}
                    />
                  )}
                </motion.div>
              )}
              {saved && (
                <motion.div key="again" {...blurSwap}>
                  {/* The file was saved once already, so closing the sheet or a failed share here changes nothing. */}
                  <Button size="lg" variant="ghost" onClick={() => saveRecoveryKey(step.secret).catch(() => {})} className="mt-3 w-full">
                    {SAVED.again}
                  </Button>
                </motion.div>
              )}
              {step.name === "setup" && step.status === "idle" && (
                <motion.div key="retry" {...blurSwap}>
                  <CreateButton label={SETUP.idle.cta} busy={false} onPress={press} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </MotionConfig>
  );
}
