"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiError, signIn } from "@/lib/wallet/browser";

const field =
  "h-[52px] w-full rounded-full bg-white px-6 text-[17px] shadow-[0_0_0_1px_rgb(0_0_0/0.06)] outline-none transition-shadow duration-200 caret-fuse-blue placeholder:text-black/40 focus:shadow-[0_0_0_1px_rgb(0_0_0/0.14)]";

export function SignInForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await signIn(String(form.get("email")), String(form.get("password")));
      // Returning clients open their wallet, new ones create one.
      const hasWallet = await api("GET", "/api/wallet").then(
        () => true,
        (e) => (e instanceof ApiError && e.status === 404 ? false : Promise.reject(e)),
      );
      const next = new URLSearchParams(location.search).get("next");
      router.replace(next ?? (hasWallet ? "/home" : "/onboarding-welcome"), { transitionTypes: ["push"] });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
      <input name="email" type="email" autoComplete="username" required aria-label="Email" placeholder="Email" className={field} />
      <input name="password" type="password" autoComplete="current-password" required aria-label="Password" placeholder="Password" className={field} />
      <p aria-live="polite" className="min-h-5 px-6 text-[13px] leading-5 text-negative first-letter:uppercase">
        {error}
      </p>
      <Button type="submit" size="lg" disabled={busy} focusableWhenDisabled aria-busy={busy}>
        {busy && <Spinner aria-hidden className="size-[18px]" />}
        Sign in
      </Button>
    </form>
  );
}
