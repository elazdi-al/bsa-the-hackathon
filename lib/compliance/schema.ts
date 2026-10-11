import { isAddress, zeroAddress } from "viem";
import { z } from "zod";
import type { CompliancePolicy, ComplianceRequest } from "./types";

export const addressSchema = z.string().refine(
  (value) => isAddress(value, { strict: false }) && value.toLowerCase() !== zeroAddress,
  "Expected a non-zero EVM address",
).transform((value) => value.toLowerCase() as `0x${string}`);
export const amountSchema = z.string().max(78).regex(/^(0|[1-9][0-9]*)$/)
  .refine((value) => BigInt(value) < 2n ** 256n, "Amount exceeds uint256");
const hexSchema = z.string().max(131_074).regex(/^0x(?:[a-fA-F0-9]{2})*$/)
  .transform((value) => value.toLowerCase() as `0x${string}`);
export const originSchema = z.string().max(512).url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password &&
    url.pathname === "/" && !url.search && !url.hash;
}, "Expected an HTTPS origin without credentials, path, query or fragment")
  .transform((value) => new URL(value).origin);

export const requestSchema = z.object({
  requestId: z.string().min(1).max(128),
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), account: addressSchema,
  nonce: z.string().min(1).max(128),
  operationHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/)
    .transform((value) => value.toLowerCase() as `0x${string}`).optional(),
  calls: z.array(z.object({ to: addressSchema, value: amountSchema.default("0"),
    data: hexSchema.default("0x"), operation: z.enum(["CALL", "DELEGATECALL"]).default("CALL"),
  }).strict()).min(1).max(16),
  dapp: z.object({ origin: originSchema, name: z.string().min(1).max(128).optional() }).strict().optional(),
}).strict();
const tokenSchema = z.object({
  chainId: z.number().int().positive(), address: addressSchema,
  symbol: z.string().min(1).max(32), decimals: z.number().int().min(0).max(36),
  approvedSpenders: z.array(addressSchema),
}).strict();
const contractSchema = z.object({
  chainId: z.number().int().positive(), address: addressSchema, name: z.string().min(1).max(128),
  kind: z.enum(["ERC20", "ERC4626"]), allowedFunctions: z.array(z.string().min(1)).min(1),
  asset: addressSchema.optional(), shareToken: addressSchema.optional(), origins: z.array(originSchema),
}).strict();
export const policySchema = z.object({
  version: z.string().min(1).max(128), decisionTtlSeconds: z.number().int().min(1).max(600),
  screeningMaxAgeSeconds: z.number().int().min(1).max(600),
  supportedChainIds: z.array(z.number().int().positive()).min(1),
  tokens: z.array(tokenSchema), contracts: z.array(contractSchema),
  nativeTransfers: z.array(z.object({ chainId: z.number().int().positive() }).strict()),
}).strict();

export function parseRequest(input: unknown): ComplianceRequest { return requestSchema.parse(input) }
export function parsePolicy(input: unknown): CompliancePolicy {
  const policy = policySchema.parse(input);
  for (const entries of [policy.tokens, policy.contracts, policy.nativeTransfers]) {
    const keys = entries.map((entry) => `${entry.chainId}:${"address" in entry ? entry.address : "native"}`);
    if (new Set(keys).size !== keys.length) throw new Error("Duplicate policy registry entry");
    if (entries.some((entry) => !policy.supportedChainIds.includes(entry.chainId))) throw new Error("Registry uses an unsupported chain");
  }
  for (const contract of policy.contracts) {
    const hasToken = (address: string | undefined) => policy.tokens.some((token) => token.chainId === contract.chainId && token.address === address);
    const functions = contract.kind === "ERC20" ? ["transfer", "approve"] : ["deposit", "withdraw", "redeem"];
    if (contract.allowedFunctions.some((name) => !functions.includes(name))) throw new Error(`Unsupported function for ${contract.name}`);
    if (contract.kind === "ERC20" && !hasToken(contract.address)) throw new Error("ERC20 token is not registered");
    if (contract.kind === "ERC4626" && (!hasToken(contract.asset) || !hasToken(contract.shareToken) || contract.shareToken !== contract.address)) {
      throw new Error("Vault must declare its registered underlying and share tokens");
    }
  }
  return policy;
}
