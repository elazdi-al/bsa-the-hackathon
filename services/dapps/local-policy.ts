import { parsePolicy } from "../../lib/compliance/schema.ts";

export const LOCAL_VAULT_ORIGIN = "https://vault.demo.swissquote.example";
/** Only for freshly deployed local fixtures, never an automatic approval of a production dApp. */
/** `swap`: the local chain's test WETH and USDC/WETH pool, which Swissquote reviews swaps through; none on Base Sepolia. */
export function localDappPolicy(usdcAddress: string, vaultAddress?: string, chainId = 31337, swap?: { weth: string; pool: string }) {
  const usdc = usdcAddress.toLowerCase();
  const vault = vaultAddress?.toLowerCase();
  const weth = swap?.weth.toLowerCase();
  const pool = swap?.pool.toLowerCase();
  const spenders = [...(vault ? [vault] : []), ...(pool ? [pool] : [])];
  return parsePolicy({
    // Ten minutes, the most the schema allows. Swissquote's sponsorship lasts as long, so the review can stay open before Face ID.
    version: ["local", vault && "dapps", pool && "swap", "1"].filter(Boolean).join("-"), decisionTtlSeconds: 600, screeningMaxAgeSeconds: 600,
    supportedChainIds: [chainId], nativeTransfers: [],
    tokens: [
      { chainId, address: usdc, symbol: "USDC", decimals: 6, approvedSpenders: spenders },
      ...(vault ? [{ chainId, address: vault, symbol: "demoUSDC", decimals: 6, approvedSpenders: [] }] : []),
      ...(weth && pool ? [{ chainId, address: weth, symbol: "WETH", decimals: 18, approvedSpenders: [pool] }] : []),
    ],
    contracts: [
      { chainId, address: usdc, name: "USDC", kind: "ERC20", allowedFunctions: spenders.length ? ["transfer", "approve"] : ["transfer"], origins: vault ? [LOCAL_VAULT_ORIGIN] : [] },
      ...(vault ? [{ chainId, address: vault, name: "Demo USDC vault", kind: "ERC4626", asset: usdc, shareToken: vault,
        allowedFunctions: ["deposit", "withdraw", "redeem"], origins: [LOCAL_VAULT_ORIGIN] }] : []),
      ...(weth && pool ? [
        { chainId, address: weth, name: "WETH", kind: "ERC20", allowedFunctions: ["transfer", "approve"], origins: [] },
        { chainId, address: pool, name: "Swissquote test pool", kind: "SWAP", tokens: [usdc, weth], allowedFunctions: ["swap"], origins: [] },
      ] : []),
    ],
  });
}
