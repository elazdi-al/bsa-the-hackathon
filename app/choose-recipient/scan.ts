import { formatUnits, parseUnits } from "viem";

export type Scanned = { to: string; amount?: string };

const ADDRESS = /^0x[0-9a-f]{40}$/i;
// EIP-681: ethereum:[pay-]<address>[@chain id][/function][?parameters]
const LINK = /^ethereum:(?:pay-)?(0x[0-9a-f]{40})(?:@\d+)?(?:\/(\w+))?(?:\?(.*))?$/i;
// A token amount in its smallest unit, maybe in scientific notation: "2500000" or "2.5e6".
const UNITS = /^(\d+(?:\.\d+)?)(?:e(\d+))?$/i;
// What the amount field holds: nine whole digits of USDC.
const MAX_UNITS = 10n ** 15n;

/**
 * The wallet address a QR code holds, or null when it holds none: a bare address, as the Receive sheet shows,
 * or an EIP-681 `ethereum:` link. A link asking for a transfer of USDC, the token at `usdc`, brings its amount too.
 */
export function scannedRecipient(code: string, usdc?: string): Scanned | null {
  const text = code.trim();
  if (ADDRESS.test(text)) return { to: text };
  const link = LINK.exec(text);
  if (!link) return null;
  const [, target, method, query] = link;
  if (!method) return { to: target };
  const params = new URLSearchParams(query);
  const to = params.get("address") ?? "";
  if (method !== "transfer" || !ADDRESS.test(to)) return null;
  const units = UNITS.exec(params.get("uint256") ?? "");
  const value = units ? parseUnits(units[1], Number(units[2] ?? 0)) : 0n;
  const usdcAsked = target.toLowerCase() === usdc?.toLowerCase() && value > 0n && value < MAX_UNITS;
  return usdcAsked ? { to, amount: formatUnits(value, 6) } : { to };
}
