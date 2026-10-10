import Link from "next/link";

const screens = [
  { slug: "onboarding-welcome", title: "Onboarding: welcome & Sign in with Apple", refs: "02-onboarding.mp4 (0–4.5s)" },
  { slug: "onboarding-secure", title: "Onboarding: secure your wallet", refs: "02-onboarding.mp4 (4.5–24.7s)" },
  { slug: "home", title: "Home", refs: "03, 08, 01" },
  { slug: "history", title: "Transaction history", refs: "—" },
  { slug: "settings", title: "Settings", refs: "—" },
  { slug: "coin-breakdown", title: "Coin breakdown", refs: "11-coin-breakdown.mp4" },
  { slug: "choose-recipient", title: "Address input field", refs: "05-address-input-field.mp4" },
  { slug: "send-hide-my-wallet", title: "Send with Hide My Wallet", refs: "04-send-hide-my-wallet.mp4" },
  { slug: "transaction-tracking", title: "Transaction tracking", refs: "06-transaction-tracking.mp4" },
  { slug: "pending-verification", title: "Pending verification", refs: "07-pending-verification.mp4" },
  { slug: "fuse-plus", title: "Fuse Plus membership", refs: "09-fuse-plus-membership.png" },
] as const;

export default function Index() {
  return (
    <main className="mx-auto max-w-[640px] px-6 py-20">
      <h1 className="text-heading">Fuse Wallet</h1>
      <p className="mt-1 text-body text-muted-foreground">Screens</p>
      <ul className="mt-8">
        {screens.map((s) => (
          <li key={s.slug}>
            <Link href={`/${s.slug}`} className="flex min-h-14 flex-col justify-center py-2 transition-opacity outline-none hover:opacity-60 focus-visible:ring-2 focus-visible:ring-ring">
              <span className="text-label">{s.title}</span>
              <span className="text-caption text-muted-foreground tabular-nums">{s.refs}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
