import type { Metadata } from "next";
import { WelcomeFlow } from "./_components/welcome-flow";

export const metadata: Metadata = { title: "Welcome · Fuse" };

export default function Page() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-white">
      <WelcomeFlow />
    </main>
  );
}
