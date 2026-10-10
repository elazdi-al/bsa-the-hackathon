import { formatUnits, isAddress, isAddressEqual } from "viem";
import type { Transfer } from "@/lib/wallet/phone";
import { onPhoneClock, type Wallet } from "@/app/(tabs)/_components/wallet";

export type RecentAddress = { address: string; note: string };

export const RECENT_ADDRESSES: RecentAddress[] = [
  { address: "0x8c3f6A1D2E9B4C7A05d6E1F2B3A4c5D6E7F8A9b0", note: "No previous sends" },
];

const sentUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", trailingZeroDisplay: "stripIfInteger" });
const sentOn = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** The last three addresses `wallet` paid, newest first, each with its latest send. `transfers` is newest first. */
export function recentSends(transfers: Transfer[], wallet: Pick<Wallet, "address" | "skew">): RecentAddress[] {
  const latest = new Map<string, Transfer>();
  for (const t of transfers) {
    if (latest.size === 3) break;
    if (isAddressEqual(t.from, wallet.address) && !latest.has(t.to.toLowerCase())) latest.set(t.to.toLowerCase(), t);
  }
  return [...latest.values()].map((t) => ({
    address: t.to,
    // en-GB abbreviates September as "Sept"; keep every month three letters.
    note: `Sent ${sentUsd.format(Number(formatUnits(BigInt(t.value), 6)))} · ${sentOn.format(onPhoneClock(wallet, t.timestamp)).replace("Sept", "Sep")}`,
  }));
}

/** Mock ENS. */
const HANDLES: Record<string, string> = {
  "anna.eth": "0x4BA4e2c1fb1B7d3a2f06E1d8C5B9e3A7F0d2c6B1",
};

/** A name's 300 ms debounce plus mock network latency, as one delay. An address needs no lookup. */
export const RESOLVE_DELAY_MS = 300 + 500;

const HANDLE_PATTERN = /^[a-z0-9_-]+\.eth$/i;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;

export type Resolution = { kind: "resolved"; address: string } | { kind: "notFound" };

export const isHandle = (query: string) => HANDLE_PATTERN.test(query);

/** 40 hex digits whose mixed case fails the EIP-55 checksum: most likely a typo. */
export const isMistyped = (query: string) => ADDRESS_PATTERN.test(query) && !isAddress(query);

export function looksLikeRecipient(query: string) {
  return isHandle(query) || isAddress(query);
}

export function lookupRecipient(query: string): Resolution {
  const address = isHandle(query) ? HANDLES[query.toLowerCase()] : query;
  return address ? { kind: "resolved", address } : { kind: "notFound" };
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** The send review for `to`, an address or .eth handle. */
export const reviewHref = (to: string) => `/send?${new URLSearchParams({ to })}`;

/** How the review names `to`, and the address it pays, or null when it isn't a recipient. */
export function recipientFor(to: string): { name: string; detail: string; address: string } | null {
  const recent = RECENT_ADDRESSES.find((r) => r.address === to);
  if (recent) return { name: shortAddress(recent.address), detail: recent.note, address: to };
  const resolution = looksLikeRecipient(to) ? lookupRecipient(to) : null;
  if (resolution?.kind !== "resolved") return null;
  if (resolution.address === to) return { name: shortAddress(to), detail: "Address on Base", address: to };
  return { name: to, detail: shortAddress(resolution.address), address: resolution.address };
}

// The recipient under review, so leaving the review reopens the chooser with it filled in. The review
// sets it; dismissing the chooser or finishing the send clears it.
const DRAFT_KEY = "swissquote:send-to";
export const sendDraft = {
  get: () => sessionStorage.getItem(DRAFT_KEY),
  set: (to: string) => sessionStorage.setItem(DRAFT_KEY, to),
  clear: () => sessionStorage.removeItem(DRAFT_KEY),
};
