"use client";

import { MotionConfig, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import { phoneDate, refreshWallet, useWallet } from "@/app/(tabs)/_components/wallet";
import { blocker, failure } from "@/app/send/_components/send-review";
import { FaceIdIcon } from "@/components/icons";
import { useBack } from "@/components/navigation";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { phone } from "@/lib/wallet/phone";
import { Benefits } from "./benefits";
import { GlowPlus } from "./glow-plus";
import { rise, sequence } from "./motion";

/** What Plus costs, as Swissquote's config says: `price` USDC for `days` days. */
type Plan = { price: number; days: number };

/** Face ID pays for Plus, and the button says Paying until Swissquote has extended it. `quiet` sits under a primary action. */
function PayButton({ busy, blocked, quiet, onPress, children }: { busy: boolean; blocked: boolean; quiet?: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <Button
      onClick={onPress}
      disabled={blocked || busy}
      focusableWhenDisabled
      aria-busy={busy}
      variant={quiet ? "ghost" : "inverse"}
      size={quiet ? "sm" : "lg"}
      className={cn("focus-visible:outline-white/60 aria-disabled:active:scale-100", quiet ? "text-white/70 hover:bg-white/10 hover:text-white" : "w-full", blocked && !busy && "opacity-35")}
    >
      {busy ? <Spinner aria-hidden className="size-5" /> : <FaceIdIcon size={20} />}
      {busy ? "Paying" : children}
    </Button>
  );
}

/** Swissquote Plus: an offer until the client buys it, then their welcome, until when it runs, and a way to extend it. */
export function Welcome() {
  const back = useBack("/home");
  const router = useRouter();
  const snapshot = useWallet();
  const wallet = snapshot.status === "ready" ? snapshot.wallet : undefined;
  const until = wallet && wallet.plus !== null ? phoneDate(wallet, wallet.plus) : undefined;
  // Plus is a Swissquote client product, so a wallet no client linked goes to link first. Swissquote tells Plus only
  // to the owner's session, so a member is never unlinked. Until the wallet reads, the offer holds.
  const unlinked = wallet !== undefined && wallet.owner === null;
  const [plan, setPlan] = useState<Plan>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string[]>([]);

  // Asked again once the wallet reads, in case Swissquote was out of reach the first time.
  useEffect(() => {
    phone.config().then(
      ({ plus }) => setPlan({ price: Number(formatUnits(BigInt(plus.price), 6)), days: plus.period / 86_400 }),
      () => {},
    );
  }, [wallet !== undefined]);

  // Not while paying: the payment leaving would flash "Only $0.00 available." under Paying. Held until the price is known.
  const blocked = busy ? undefined : (blocker(snapshot, plan?.price ?? 0) ?? (plan ? undefined : ""));

  async function pay() {
    setBusy(true);
    setError([]);
    try {
      await phone.buyPlus();
      await refreshWallet();
    } catch (e) {
      setError(failure(e));
    }
    setBusy(false);
  }

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial="hidden"
        animate="shown"
        variants={sequence}
        className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+16px)] md:justify-center md:py-12"
      >
        <motion.div variants={rise} className="flex justify-end pt-2">
          {/* Not while paying: Swissquote extends Plus only once the payment lands, and a failure shows here. */}
          <BackButton kind="close" tone="dark" onClick={back} disabled={busy} />
        </motion.div>

        <GlowPlus />

        <motion.h1
          variants={rise}
          className="mt-8 text-center text-title text-balance text-white"
        >
          {until ? "Welcome to Swissquote Plus" : "Get Swissquote Plus"}
        </motion.h1>
        <motion.p
          variants={rise}
          className="mx-auto mt-2 max-w-[290px] text-center text-body text-balance text-white/55"
        >
          Your membership for bank transfers, card spending and premium benefits.
        </motion.p>
        {/* One line tall before the price is known, so the benefits don't move when it comes in. */}
        <motion.p variants={rise} className="mt-5 h-lh text-center text-label text-white tabular-nums">
          {until ? `Plus runs until ${until}.` : plan && `${plan.price} USDC for ${plan.days} days`}
        </motion.p>
        {!until && (
          <motion.p variants={rise} className="mt-1 text-center text-caption text-balance text-white/55">
            Paid once from your wallet. It doesn&apos;t renew on its own.
          </motion.p>
        )}

        <Benefits />

        <motion.div variants={rise} className="mt-auto pt-6 md:mt-0 md:pt-8">
          {/* Two lines kept free on the offer, so its button doesn't move when a line comes in. A member's screen is full, so it keeps none. */}
          <p className={cn("mb-3 flex items-end justify-center text-center text-caption text-balance text-white/55", until ? !blocked && "hidden" : "h-[2lh]")}>
            {unlinked ? "Plus is for Swissquote clients. Link your wallet to your account first." : blocked}
          </p>
          {error.length > 0 && (
            <div role="alert" className="mb-3 text-center text-caption text-negative">
              {error.map((line) => (
                <p key={line} className="first-letter:uppercase">
                  {line}
                </p>
              ))}
            </div>
          )}
          {until ? (
            <div className="flex flex-col items-center gap-2">
              <Button onClick={back} disabled={busy} variant="inverse" size="lg" className="w-full focus-visible:outline-white/60">
                Continue
              </Button>
              <PayButton quiet busy={busy} blocked={blocked !== undefined} onPress={pay}>
                {plan ? `Extend ${plan.days} days for ${plan.price} USDC` : "Extend with Face ID"}
              </PayButton>
            </div>
          ) : unlinked ? (
            <Button
              onClick={() => router.push("/settings", { transitionTypes: ["push"] })}
              variant="inverse"
              size="lg"
              className="w-full focus-visible:outline-white/60"
            >
              Link your Swissquote account
            </Button>
          ) : (
            <PayButton busy={busy} blocked={blocked !== undefined} onPress={pay}>
              Subscribe with Face ID
            </PayButton>
          )}
        </motion.div>
      </motion.div>
    </MotionConfig>
  );
}
