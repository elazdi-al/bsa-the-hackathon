// EIP-712 tickets Swissquote signs for the partner, so the partner can check Swissquote's
// decisions against a public address without sharing a secret with it.
import { verifyTypedData, type Address, type Hex, type LocalAccount } from "viem";

const domain = (chainId: number) => ({ name: "Swissquote Wallet", version: "1", chainId });

const types = {
  /** Swissquote verified and stored Share B of this key, so the partner may store Share C. */
  Shares: [
    { name: "signer", type: "address" },
    { name: "passkeyX", type: "bytes32" },
    { name: "passkeyY", type: "bytes32" },
    { name: "keyCommitment", type: "bytes" },
    { name: "slopeCommitment", type: "bytes" },
    { name: "expiry", type: "uint64" },
  ],
  /** Swissquote verified the client's identity and approves this recovery UserOperation. */
  RecoveryApproval: [
    { name: "wallet", type: "address" },
    { name: "userOpHash", type: "bytes32" },
    { name: "expiry", type: "uint64" },
  ],
} as const;

export type Shares = { signer: Address; passkeyX: Hex; passkeyY: Hex; keyCommitment: Hex; slopeCommitment: Hex; expiry: number };
export type RecoveryApproval = { wallet: Address; userOpHash: Hex; expiry: number };
type Messages = { Shares: Shares; RecoveryApproval: RecoveryApproval };
export type Ticket<K extends keyof Messages> = { message: Messages[K]; signature: Hex };

const TTL = 300;

export async function signTicket<K extends keyof Messages>(
  account: LocalAccount,
  chainId: number,
  kind: K,
  message: Omit<Messages[K], "expiry">,
): Promise<Ticket<K>> {
  const full = { ...message, expiry: Math.floor(Date.now() / 1000) + TTL } as Messages[K];
  const signature = await account.signTypedData({ domain: domain(chainId), types, primaryType: kind, message: full } as never);
  return { message: full, signature };
}

/** Throws unless `swissquote` signed the ticket and it has not expired. */
export async function verifyTicket<K extends keyof Messages>(swissquote: Address, chainId: number, kind: K, ticket: Ticket<K>) {
  const ok = await verifyTypedData({
    address: swissquote,
    domain: domain(chainId),
    types,
    primaryType: kind,
    message: ticket.message,
    signature: ticket.signature,
  } as never);
  if (!ok || ticket.message.expiry < Date.now() / 1000) throw new Error(`Invalid or expired ${kind} ticket.`);
  return ticket.message;
}
