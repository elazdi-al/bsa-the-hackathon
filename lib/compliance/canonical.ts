import { sha256, stringToHex } from "viem";
import { parseRequest } from "./schema";

/** JSON-only schema encoding: sorted object keys, ordered arrays. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new Error("Canonical payload requires JSON values and safe integer numbers");
}
export function hashPayload(domain: string, value: unknown): `0x${string}` {
  return sha256(stringToHex(`${domain}\n${canonicalJson(value)}`));
}
export function hashRequest(input: unknown): `0x${string}` {
  return hashPayload("swissquote-compliance/request/v1", parseRequest(input));
}
