export type RecentAddress = { label: string; note: string };

export const RECENT_ADDRESSES: RecentAddress[] = [{ label: "ECmf...iNd6", note: "No previous sends" }];

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
