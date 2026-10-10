"use client";

import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useState } from "react";
import { blurred, sharp, smooth } from "@/app/(tabs)/_components/transitions";
import { BackButton } from "@/components/ui/back-button";
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

  // While the keyboard is up the content lifts above it and the gradient steps aside.
  // From sm the band is a 50svh strip, so the list starts in its fade (24svh, less the 56px header) instead of the bottom.
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
            className={`flex items-center justify-between pt-[calc(env(safe-area-inset-top)+16px)] pr-[30px] pl-[46px] transition-colors duration-300 ${
              onGradient ? "text-white" : "text-muted-foreground"
            }`}
          >
            <h1 className="text-label">Secure your wallet</h1>
            <BackButton kind="close" fallback="/onboarding-welcome" tone={onGradient ? "dark" : "light"} />
          </motion.header>

          <div
            className={`flex flex-1 flex-col px-[30px] ${
              setup
                ? "justify-center pb-24"
                : `pb-[max(calc(env(safe-area-inset-bottom)+12px),36px)] ${lifted ? "justify-start pt-16" : "justify-end sm:justify-start sm:pt-[calc(24svh-56px)]"}`
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
                      state={state}
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
                {setup && <SetupRow key="setup" ready={step.status === "ready"} />}
              </AnimatePresence>
            </motion.ul>

            <motion.div layout="position" {...entrance(1)} className="relative mt-7">
              <AnimatePresence mode="popLayout" initial={false}>
                {(step.name === "device" || step.name === "twofa") && current && (
                  <motion.div key="create" {...blurSwap}>
                    <CreateButton
                      item={current}
                      busy={step.status === "creating"}
                      onPress={() => dispatch({ type: "create" })}
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
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
