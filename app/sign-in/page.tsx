import type { Metadata } from "next";
import { Screen } from "@/components/navigation";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Swissquote" };

export default function Page() {
  return (
    <Screen>
      <main className="flex min-h-dvh flex-col bg-white px-[30px] pt-[calc(env(safe-area-inset-top)+64px)] pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-sm">
          <p className="text-[22px] font-bold tracking-[-0.03em] text-[#e30613]">Swissquote</p>
          <h1 className="mt-8 text-[28px] leading-[34px] font-bold tracking-[-0.02em]">Sign in</h1>
          <p className="mt-2 text-[15px] leading-5 text-black/40">
            Demo: a mocked Swissquote sign-in. Use claire@example.com and the password claire.
          </p>
          <SignInForm />
        </div>
      </main>
    </Screen>
  );
}
