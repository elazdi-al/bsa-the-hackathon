export type RecentAddress = { address: string; note: string };

export const RECENT_ADDRESSES: RecentAddress[] = [
  { address: "ECmfR3kVwq8TzYb5HnJ2LpXc6AgUd9sMtB4yiNd6", note: "No previous sends" },
];

/** Mock .sol name service. */
const HANDLES: Record<string, string> = {
  "toly.sol": "86xCnPeV69n6t3DnyGvkKobyfrFbmqqwoakwrMSc2MMY",
};

/** Debounce plus mock network latency, as one delay. */
export const RESOLVE_DELAY_MS = 1000;

const HANDLE_PATTERN = /^[a-z0-9_-]+\.sol$/i;
const ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export type Resolution = { kind: "resolved"; address: string } | { kind: "notFound" };

export function looksLikeRecipient(query: string) {
  return HANDLE_PATTERN.test(query) || ADDRESS_PATTERN.test(query);
}

export function lookupRecipient(query: string): Resolution {
  const address = HANDLE_PATTERN.test(query) ? HANDLES[query.toLowerCase()] : query;
  return address ? { kind: "resolved", address } : { kind: "notFound" };
}

export function shortAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/** The send review for `to`, an address or .sol handle. */
export const reviewHref = (to: string) => `/send-hide-my-wallet?${new URLSearchParams({ to })}`;

/** How the review names `to`, or null when it isn't a recipient. */
export function recipientFor(to: string): { name: string; detail: string } | null {
  const recent = RECENT_ADDRESSES.find((r) => r.address === to);
  if (recent) return { name: shortAddress(recent.address), detail: recent.note };
  const resolution = looksLikeRecipient(to) ? lookupRecipient(to) : null;
  if (resolution?.kind !== "resolved") return null;
  if (resolution.address === to) return { name: shortAddress(to), detail: "No previous sends" };
  return { name: to, detail: shortAddress(resolution.address) };
}

// The recipient under review, so leaving the review reopens the chooser with it filled in. The review
// sets it; dismissing the chooser or finishing the send clears it.
const DRAFT_KEY = "fuse:send-to";
export const sendDraft = {
  get: () => sessionStorage.getItem(DRAFT_KEY),
  set: (to: string) => sessionStorage.setItem(DRAFT_KEY, to),
  clear: () => sessionStorage.removeItem(DRAFT_KEY),
};
