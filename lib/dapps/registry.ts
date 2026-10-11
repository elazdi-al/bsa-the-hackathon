import type { CompliancePolicy } from "../compliance/types";
import type { VaultAction, VaultDapp } from "./model";

/** Publish only the reviewed adapter's public metadata, never provider credentials or policy secrets. */
export function selectVaults(policy: CompliancePolicy, chainId: number): VaultDapp[] {
  if (!policy.supportedChainIds.includes(chainId)) return [];
  return policy.contracts.filter((contract) => contract.chainId === chainId && contract.kind === "ERC4626").map((contract) => {
    const asset = policy.tokens.find((token) => token.chainId === chainId && token.address === contract.asset)!;
    const shares = policy.tokens.find((token) => token.chainId === chainId && token.address === contract.shareToken)!;
    const tokenContract = policy.contracts.find((item) => item.chainId === chainId && item.address === asset.address && item.kind === "ERC20");
    const approvalOrigin = contract.origins.find((origin) => tokenContract?.origins.includes(origin));
    const canApprove = !!approvalOrigin && !!tokenContract?.allowedFunctions.includes("approve") && asset.approvedSpenders.includes(contract.address);
    const actions: VaultAction[] = [];
    if (canApprove && contract.allowedFunctions.includes("deposit")) actions.push("deposit");
    if (contract.allowedFunctions.includes("withdraw")) actions.push("withdraw");
    if (canApprove) actions.push("revoke");
    const origin = approvalOrigin ?? contract.origins[0] ?? "";
    const available = !!origin && actions.length > 0;
    return {
      address: contract.address, chainId, name: contract.name, origin,
      asset: { address: asset.address, symbol: asset.symbol, decimals: asset.decimals },
      shares: { address: shares.address, symbol: shares.symbol, decimals: shares.decimals }, actions, available,
      ...(!available ? { unavailableReason: "No supported action and origin are enabled by policy." } : {}),
    };
  });
}
