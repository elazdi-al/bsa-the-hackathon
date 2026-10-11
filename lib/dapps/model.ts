// Browser-safe reviewed ERC-4626 adapter. No wallet secrets, providers or signing logic.
import { encodeFunctionData, erc20Abi, parseAbi, parseUnits, type Address, type Hex } from "viem";
import type { ComplianceDecision, ProviderMode } from "../compliance/types";

export const vaultReadAbi = parseAbi([
  "function asset() view returns (address)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function maxDeposit(address) view returns (uint256)",
  "function maxWithdraw(address) view returns (uint256)",
  "function previewDeposit(uint256) view returns (uint256)",
  "function previewWithdraw(uint256) view returns (uint256)",
  "function deposit(uint256 assets, address receiver) returns (uint256 shares)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)",
]);
export type VaultAction = "deposit" | "withdraw" | "revoke";
export type VaultStep = VaultAction | "approve";
export type DappMetadata = { origin: string; name?: string };
export type DappCall = { to: Address; data: Hex; value?: bigint };
export type DappToken = { address: Address; symbol: string; decimals: number };
export type VaultDapp = {
  address: Address; chainId: number; name: string; origin: string;
  asset: DappToken; shares: DappToken; actions: VaultAction[];
  available: boolean; unavailableReason?: string;
};
export type DappCatalog = { chainId: number; mode: ProviderMode; policyVersion: string; vaults: VaultDapp[] };
export type VaultSnapshot = {
  blockNumber: string; assetBalance: string; shareBalance: string; assetValue: string;
  allowance: string; maxDeposit: string; maxWithdraw: string;
};
export type VaultQuote = { action: VaultAction; amount: string; expectedOutput: string; snapshot: VaultSnapshot };

/** Reject excess precision instead of viem's default rounding, and never use floats for intent. */
export function parseVaultAmount(text: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36 || !/^\d+(\.\d+)?$/.test(text) || text.length > 120) {
    throw new Error("Enter a positive amount.");
  }
  if ((text.split(".")[1]?.length ?? 0) > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const amount = parseUnits(text, decimals);
  if (amount <= 0n || amount >= 2n ** 256n) throw new Error("Enter a positive amount within the token limit.");
  return amount;
}

/** One call per existing wallet operation. Always return assets/shares to this wallet. */
export function buildVaultCall(vault: VaultDapp, wallet: Address, step: VaultStep, amount: bigint): DappCall {
  if (!vault.available) throw new Error(vault.unavailableReason ?? "This vault is unavailable.");
  const action = step === "approve" ? "deposit" : step;
  if (!vault.actions.includes(action)) throw new Error("This action is not enabled by the reviewed policy.");
  if (step !== "revoke" && (amount <= 0n || amount >= 2n ** 256n - 1n)) throw new Error("A finite positive amount is required.");
  if (step === "approve" || step === "revoke") return {
    to: vault.asset.address,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault.address, step === "revoke" ? 0n : amount] }),
  };
  return {
    to: vault.address,
    data: step === "deposit"
      ? encodeFunctionData({ abi: vaultReadAbi, functionName: "deposit", args: [amount, wallet] })
      : encodeFunctionData({ abi: vaultReadAbi, functionName: "withdraw", args: [amount, wallet, wallet] }),
  };
}

export const needsApproval = (quote: VaultQuote) => quote.action === "deposit" && BigInt(quote.snapshot.allowance) < BigInt(quote.amount);
export const decisionAllowsSigning = (decision: ComplianceDecision | undefined, now = Date.now()) =>
  !!decision && decision.status === "ALLOW" && Number.isFinite(Date.parse(decision.expiresAt)) && Date.parse(decision.expiresAt) > now;
