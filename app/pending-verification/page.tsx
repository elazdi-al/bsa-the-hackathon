import Link from "next/link";
import { XCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { BridgeLogo } from "./_components/bridge-logo";
import { IdentityIllustration } from "./_components/identity-illustration";
import { verification } from "./data";

// House entrance: each block sharpens in from a soft blur; the delay classes stagger them.
const enter =
  "transition-[opacity,filter,translate] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] starting:opacity-0 motion-safe:starting:translate-y-1.5 motion-safe:starting:blur-[4px]";

export default function Page() {
  return (
    <main className="relative mx-auto grid min-h-dvh w-full max-w-[430px] place-items-center overflow-hidden bg-[#f2f2f2] px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <Link
        href="/home"
        aria-label="Close"
        className="absolute top-[calc(env(safe-area-inset-top)+8px)] right-2 grid size-11 place-items-center rounded-full text-black/20 transition-[color,scale] duration-150 ease-out hover:text-black/30 focus-visible:outline-2 focus-visible:outline-black/40 active:scale-[0.96]"
      >
        <XCircleIcon weight="fill" size={30} />
      </Link>

      <div className="flex flex-col items-center text-center">
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
  );
}
