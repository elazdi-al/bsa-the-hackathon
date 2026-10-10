// Request parsing and error responses for the Wallet API's route handlers.
import { WebAuthnP256 } from "ox";
import type { Hex } from "viem";
import * as z from "zod";
import type { Passkey } from "../account.ts";
import type { assertion } from "../schema.ts";

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

export async function parse<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  const body = await request.json().catch(() => {
    throw new HttpError(400, "The body is not JSON.");
  });
  return schema.parse(body);
}

/** True when `wire` is the wallet passkey's assertion, with Face ID, over `challenge`. */
export function verifyAssertion(wire: z.infer<typeof assertion>, challenge: Hex, key: Passkey, rpId: string): boolean {
  return WebAuthnP256.verify({
    challenge,
    rpId,
    metadata: { ...wire.metadata, userVerificationRequired: true },
    signature: { r: BigInt(wire.signature.r), s: BigInt(wire.signature.s) },
    publicKey: { prefix: 4, x: BigInt(key.x), y: BigInt(key.y) },
  });
}
