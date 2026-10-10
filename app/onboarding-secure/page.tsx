import type { Metadata } from "next";
import { SecureFlow } from "./_components/secure-flow";

export const metadata: Metadata = { title: "Secure your wallet · Fuse" };

export default function Page() {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-white">
      <SecureFlow />
    </main>
  );
}
