// Request parsing and error responses for the Wallet API's route handlers.
import { WebAuthnP256 } from "ox";
import { isAddress, isHex, type Address, type Hex } from "viem";
import * as z from "zod";
import type { Passkey } from "../account.ts";
import { HOLDERS } from "../shamir.ts";

export class HttpError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** Wraps a route handler so thrown HttpErrors and invalid input become JSON responses. */
export function route<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof HttpError) return Response.json({ error: error.message, ...error.body }, { status: error.status });
      if (error instanceof z.ZodError) return Response.json({ error: "Invalid request.", issues: error.issues }, { status: 400 });
      console.error(error);
      return Response.json({ error: "Something went wrong." }, { status: 500 });
    }
  };
}

export const hex = z.custom<Hex>((v) => typeof v === "string" && isHex(v));
export const bytes32 = z.custom<Hex>((v) => typeof v === "string" && isHex(v) && v.length === 66);
export const address = z.custom<Address>((v) => typeof v === "string" && isAddress(v));
export const passkey = z.object({ x: bytes32, y: bytes32 }) satisfies z.ZodType<Passkey>;
export const share = (x: (typeof HOLDERS)[keyof typeof HOLDERS]) => z.object({ x: z.literal(x), y: bytes32 });
export const commitments = z.tuple([hex, hex]);
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
export type WireAssertion = z.infer<typeof assertion>;

export const parse = async <T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> => schema.parse(await request.json());

/** True when `wire` is the wallet passkey's assertion, with Face ID, over `challenge`. */
export function verifyAssertion(wire: WireAssertion, challenge: Hex, key: Passkey, rpId: string): boolean {
  return WebAuthnP256.verify({
    challenge,
    rpId,
    metadata: { ...wire.metadata, userVerificationRequired: true },
    signature: { r: BigInt(wire.signature.r), s: BigInt(wire.signature.s) },
    publicKey: { prefix: 4, x: BigInt(key.x), y: BigInt(key.y) },
  });
}
