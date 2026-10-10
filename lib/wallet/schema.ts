// Shapes of what crosses a trust boundary, parsed by Swissquote's API and the partner alike.
import { isAddress, isHex, type Address, type Hex } from "viem";
import * as z from "zod";
import type { Passkey } from "./account.ts";
import { HOLDERS } from "./shamir.ts";

const hexOf = (bytes?: number) => z.custom<Hex>((v) => typeof v === "string" && isHex(v) && (bytes === undefined || v.length === 2 + 2 * bytes));

export const hex = hexOf();
export const bytes32 = hexOf(32);
/** An ECDSA signature, r ‖ s ‖ v. */
export const signature = hexOf(65);
export const address = z.custom<Address>((v) => typeof v === "string" && isAddress(v));
export const passkey = z.object({ x: bytes32, y: bytes32 }) satisfies z.ZodType<Passkey>;
export const share = (x: (typeof HOLDERS)[keyof typeof HOLDERS]) => z.object({ x: z.literal(x), y: bytes32 });
export const commitments = z.tuple([hexOf(33), hexOf(33)]);
export const userOp = z.record(z.string(), z.unknown());
/** What an ID check reads: the ID document, and the face its liveness check saw. */
export const identity = z.object({ document: z.string().min(1), selfie: z.string().min(1) });

/** A passkey assertion with its signature as hex, the way the phone sends it. */
export const assertion = z.object({
  metadata: z.object({
    authenticatorData: hex,
    clientDataJSON: z.string(),
    challengeIndex: z.number().int(),
    typeIndex: z.number().int(),
    userVerificationRequired: z.boolean(),
  }),
  signature: z.object({ r: hex, s: hex }),
});

const ticket = <T extends z.ZodRawShape>(message: T) =>
  z.object({ message: z.object({ ...message, expiry: z.number().int() }), signature });

export const sharesTicket = ticket({
  signer: address,
  passkeyX: bytes32,
  passkeyY: bytes32,
  keyCommitment: hexOf(33),
  slopeCommitment: hexOf(33),
});
export const recoveryApproval = ticket({ wallet: address, userOpHash: bytes32 });
