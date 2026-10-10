import Link from "next/link";

const screens = [
  { slug: "onboarding-welcome", title: "Onboarding: welcome" },
  { slug: "onboarding-secure", title: "Onboarding: secure your wallet" },
  { slug: "home", title: "Home" },
  { slug: "history", title: "Transaction history" },
  { slug: "settings", title: "Settings" },
  { slug: "coin-breakdown", title: "Coin breakdown" },
  { slug: "choose-recipient", title: "Address input field" },
  { slug: "send", title: "Send" },
  { slug: "transaction-tracking", title: "Transaction tracking" },
  { slug: "recover", title: "Recover wallet" },
  { slug: "plus", title: "Swissquote Plus membership" },
] as const;

export default function Index() {
  return (
    <main className="mx-auto max-w-[640px] px-6 py-20">
      <h1 className="text-heading">Swissquote Wallet</h1>
      <p className="mt-1 text-body text-muted-foreground">Screens</p>
      <ul className="mt-8">
        {screens.map((s) => (
          <li key={s.slug}>
            <Link href={`/${s.slug}`} className="flex min-h-14 flex-col justify-center py-2 transition-opacity outline-none hover:opacity-60 focus-visible:ring-2 focus-visible:ring-ring">
              <span className="text-label">{s.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
