// Swissquote's clients: the ID check it runs before a recovery or a lost-phone lock.
//
// MOCKED: in the product Swissquote matches the document and the selfie against the wallet owner's
// KYC record. This build accepts any; the schema only refuses empty ones.
import type { Address } from "viem";
import type * as z from "zod";
import type { identity } from "../schema.ts";

/** Throws unless the document and the face match the KYC record of `wallet`'s owner. */
export function checkIdentity(_wallet: Address, _identity: z.infer<typeof identity>): void {}
