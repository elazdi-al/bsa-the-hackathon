"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useReducer } from "react";
import { blurred, sharp, smooth } from "@/app/(tabs)/_components/transitions";
import { createPasskey, createRecoveryKey, registerWallet, splitWalletKey } from "@/lib/auth-client";
import { KEYS, RECOVERY_FILE, SETUP } from "../data";
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
function saveRecoveryKey(secret: string): Promise<void> {
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
  const [step, dispatch] = useReducer(flowReducer, initialFlow);

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
    const result = await registerWallet(keys);
    dispatch(result.ok ? { type: "registered", address: result.value.address } : { type: "failed", error: result.error });
  };

  // All work starts in the click, never in an effect: WebAuthn and the share sheet need the click's user
  // activation, so nothing may await before them, and React runs effects twice in development.
  const press = async () => {
    if (step.status !== "idle") return;
    dispatch({ type: "start" });
    switch (step.name) {
      case "passkey": {
        const result = await createPasskey();
        return dispatch(result.ok ? { type: "passkeyCreated", credentialId: result.value } : { type: "failed", error: result.error });
      }
      case "key": {
        const result = await splitWalletKey();
        return dispatch(result.ok ? { type: "keySplit", mpcKey: result.value } : { type: "failed", error: result.error });
      }
      case "recovery": {
        const { secret, publicKey } = createRecoveryKey();
        try {
          await saveRecoveryKey(secret);
        } catch (error) {
          const closed = error instanceof DOMException && error.name === "AbortError";
          return dispatch(closed ? { type: "cancelled" } : { type: "failed", error: RECOVERY_FILE.failed });
        }
        dispatch({ type: "recoverySaved", recoveryKey: publicKey });
        return register({ ...step.keys, recoveryKey: publicKey });
      }
      case "setup":
        return register(step.keys);
    }
  };

  const setup = step.name === "setup";
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
                  <CreateButton
                    label={step.status === "idle" ? current.cta.idle : current.cta.busy}
                    Icon={current.Icon}
                    accent={current.accent}
                    busy={step.status !== "idle"}
                    error={step.status === "idle" ? step.error : undefined}
                    onPress={press}
                  />
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
