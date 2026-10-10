import type { Metadata } from "next";
import { Screen } from "@/components/navigation";
import { BackButton } from "@/components/ui/back-button";
import { BridgeLogo } from "./_components/bridge-logo";
import { IdentityIllustration } from "./_components/identity-illustration";
import { verification } from "./data";

export const metadata: Metadata = { title: "Verification · Fuse" };

// House entrance (the shared `reveal` and `blurred`, in CSS): each block sharpens in; the delay classes stagger them.
const enter =
  "transition-[opacity,filter,translate] duration-450 ease-[cubic-bezier(0.23,1,0.32,1)] starting:opacity-0 motion-safe:starting:translate-y-1.5 motion-safe:starting:blur-[8px]";

export default function Page() {
  return (
    <Screen>
      <main className="relative grid min-h-dvh w-full place-items-center overflow-hidden bg-[#f2f2f2] px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        {/* Where Fuse Plus keeps its close: the top right of the content column, not the window's corner. */}
        <div className="absolute inset-x-0 top-0 mx-auto flex max-w-md justify-end px-4 pt-[calc(env(safe-area-inset-top)+8px)]">
          <BackButton kind="close" fallback="/settings" />
        </div>

        <div className="flex flex-col items-center text-center md:[zoom:1.25]">
          <div className={enter}>
            <IdentityIllustration />
          </div>

          <h1 className={`${enter} mt-10 text-[20px] leading-6 font-semibold delay-[60ms]`}>
            <span className="mb-1 flex items-center justify-center gap-2">
              <BridgeLogo className="size-[22px]" />
              {verification.provider}
            </span>{" "}
            <span className="block">{verification.title}</span>
          </h1>

          <p className={`${enter} mt-3.5 max-w-[310px] text-[13px] leading-[19px] text-black/40 delay-[120ms]`}>
            {verification.notice}
            <br />
            {verification.followUp}{" "}
            <a
              href={`mailto:${verification.supportEmail}`}
              className="rounded-sm underline decoration-black/10 underline-offset-2 transition-colors duration-150 hover:text-black/60 focus-visible:outline-2 focus-visible:outline-black/40"
            >
              {verification.supportEmail}
            </a>
            .
          </p>
        </div>
      </main>
    </Screen>
  );
}
