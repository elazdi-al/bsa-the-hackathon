export type RecentAddress = { address: string; note: string };

export const RECENT_ADDRESSES: RecentAddress[] = [
  { address: "0x8C3f6a1D2e9B4c7A05d6E1f2B3a4C5d6E7f8A9b0", note: "No previous sends" },
];

/** Mock ENS. */
const HANDLES: Record<string, string> = {
  "anna.eth": "0x4bA4E2C1fb1B7D3a2f06e1D8C5b9e3a7F0d2c6B1",
};

/** Debounce plus mock network latency, as one delay. */
export const RESOLVE_DELAY_MS = 1000;

const HANDLE_PATTERN = /^[a-z0-9_-]+\.eth$/i;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;

export type Resolution = { kind: "resolved"; address: string } | { kind: "notFound" };

export function looksLikeRecipient(query: string) {
  return HANDLE_PATTERN.test(query) || ADDRESS_PATTERN.test(query);
}

export function lookupRecipient(query: string): Resolution {
  const address = HANDLE_PATTERN.test(query) ? HANDLES[query.toLowerCase()] : query;
  return address ? { kind: "resolved", address } : { kind: "notFound" };
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** The send review for `to`, an address or .sol handle. */
export const reviewHref = (to: string) => `/send-hide-my-wallet?${new URLSearchParams({ to })}`;

/** How the review names `to`, and the address it pays, or null when it isn't a recipient. */
export function recipientFor(to: string): { name: string; detail: string; address: string } | null {
  const recent = RECENT_ADDRESSES.find((r) => r.address === to);
  if (recent) return { name: shortAddress(recent.address), detail: recent.note, address: to };
  const resolution = looksLikeRecipient(to) ? lookupRecipient(to) : null;
  if (resolution?.kind !== "resolved") return null;
  if (resolution.address === to) return { name: shortAddress(to), detail: "No previous sends", address: to };
  return { name: to, detail: shortAddress(resolution.address), address: resolution.address };
}

// The recipient under review, so leaving the review reopens the chooser with it filled in. The review
// sets it; dismissing the chooser or finishing the send clears it.
const DRAFT_KEY = "fuse:send-to";
export const sendDraft = {
  get: () => sessionStorage.getItem(DRAFT_KEY),
  set: (to: string) => sessionStorage.setItem(DRAFT_KEY, to),
  clear: () => sessionStorage.removeItem(DRAFT_KEY),
};
