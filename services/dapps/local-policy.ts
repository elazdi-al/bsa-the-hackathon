import { parsePolicy } from "../../lib/compliance/schema.ts";

export const LOCAL_VAULT_ORIGIN = "https://vault.demo.swissquote.example";
/** Only for freshly deployed local fixtures, never an automatic approval of a production dApp. */
export function localDappPolicy(usdcAddress: string, vaultAddress?: string, chainId = 31337) {
  const usdc = usdcAddress.toLowerCase();
  const vault = vaultAddress?.toLowerCase();
  return parsePolicy({
    // Ten minutes, the most the schema allows. Swissquote's sponsorship lasts as long, so the review can stay open before Face ID.
    version: vault ? "local-dapps-1" : "local-1", decisionTtlSeconds: 600, screeningMaxAgeSeconds: 600,
    supportedChainIds: [chainId], nativeTransfers: [],
    tokens: [
      { chainId, address: usdc, symbol: "USDC", decimals: 6, approvedSpenders: vault ? [vault] : [] },
      ...(vault ? [{ chainId, address: vault, symbol: "demoUSDC", decimals: 6, approvedSpenders: [] }] : []),
    ],
    contracts: [
      { chainId, address: usdc, name: "USDC", kind: "ERC20", allowedFunctions: vault ? ["transfer", "approve"] : ["transfer"], origins: vault ? [LOCAL_VAULT_ORIGIN] : [] },
      ...(vault ? [{ chainId, address: vault, name: "Demo USDC vault", kind: "ERC4626", asset: usdc, shareToken: vault,
        allowedFunctions: ["deposit", "withdraw", "redeem"], origins: [LOCAL_VAULT_ORIGIN] }] : []),
    ],
  });
}
