import type { Metadata } from "next";
import { SecureFlow } from "./_components/secure-flow";

export const metadata: Metadata = { title: "Secure your wallet · Fuse" };

export default function Page() {
  return (
    <main className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-white">
      <SecureFlow />
    </main>
  );
}
