// Read-only adapter around the current wallet chain. Signing stays in phone.prepare/approve.
import { erc20Abi, isAddressEqual, type Address } from "viem";
import { selectVaults } from "../../lib/dapps/registry";
import { vaultReadAbi, type DappCatalog, type VaultAction, type VaultDapp, type VaultQuote, type VaultSnapshot } from "../../lib/dapps/model";
import { chain, publicClient } from "../../lib/wallet/env";
import { HttpError } from "../../lib/wallet/api/http";
import { getComplianceRuntime } from "../compliance/runtime";

export async function getDappCatalog(): Promise<DappCatalog> {
  const { engine, mode } = getComplianceRuntime();
  if (await publicClient.getChainId() !== chain.id) throw new HttpError(503, "The wallet RPC is on a different network.");
  const vaults = await Promise.all(selectVaults(engine.policy, chain.id).map(async (vault): Promise<VaultDapp> => {
    if (!vault.available) return vault;
    try {
      const code = await publicClient.getCode({ address: vault.address });
      if (!code || code === "0x") return { ...vault, available: false, unavailableReason: "This registry entry is not deployed on the wallet network." };
      const [asset, decimals, assetDecimals] = await Promise.all([
        publicClient.readContract({ address: vault.address, abi: vaultReadAbi, functionName: "asset" }),
        publicClient.readContract({ address: vault.address, abi: vaultReadAbi, functionName: "decimals" }),
        publicClient.readContract({ address: vault.asset.address, abi: erc20Abi, functionName: "decimals" }),
      ]);
      if (!isAddressEqual(asset, vault.asset.address) || decimals !== vault.shares.decimals || assetDecimals !== vault.asset.decimals) {
        return { ...vault, available: false, unavailableReason: "The deployed vault does not match the reviewed asset or decimals." };
      }
      return vault;
    } catch {
      return { ...vault, available: false, unavailableReason: "The vault could not be verified. Retry when the network is available." };
    }
  }));
  return { chainId: chain.id, mode, policyVersion: engine.policy.version, vaults };
}

export async function requireDapp(address: Address): Promise<VaultDapp> {
  const vault = (await getDappCatalog()).vaults.find((item) => isAddressEqual(item.address, address));
  if (!vault) throw new HttpError(403, "This vault is outside the reviewed registry for the wallet network.");
  if (!vault.available) throw new HttpError(409, vault.unavailableReason ?? "This vault is unavailable.");
  return vault;
}

export async function readVaultSnapshot(vault: VaultDapp, wallet: Address, minimumBlock?: bigint): Promise<VaultSnapshot> {
  // viem caches getBlockNumber by default. After a confirmed transaction that can be the
  // preceding block, so pin every contract read to a fresh head or the receipt block.
  const latestBlock = await publicClient.getBlockNumber({ cacheTime: 0 });
  const blockNumber = minimumBlock && minimumBlock > latestBlock ? minimumBlock : latestBlock;
  const [assetBalance, shareBalance, allowance, maxDeposit, maxWithdraw] = await Promise.all([
    publicClient.readContract({ address: vault.asset.address, abi: erc20Abi, functionName: "balanceOf", args: [wallet], blockNumber }),
    publicClient.readContract({ address: vault.address, abi: vaultReadAbi, functionName: "balanceOf", args: [wallet], blockNumber }),
    publicClient.readContract({ address: vault.asset.address, abi: erc20Abi, functionName: "allowance", args: [wallet, vault.address], blockNumber }),
    publicClient.readContract({ address: vault.address, abi: vaultReadAbi, functionName: "maxDeposit", args: [wallet], blockNumber }),
    publicClient.readContract({ address: vault.address, abi: vaultReadAbi, functionName: "maxWithdraw", args: [wallet], blockNumber }),
  ]);
  const assetValue = await publicClient.readContract({ address: vault.address, abi: vaultReadAbi, functionName: "convertToAssets", args: [shareBalance], blockNumber });
  return Object.fromEntries(Object.entries({ blockNumber, assetBalance, shareBalance, assetValue, allowance, maxDeposit, maxWithdraw })
    .map(([key, value]) => [key, value.toString()])) as VaultSnapshot;
}

/** A preview is not authorization. Each resulting call must separately pass the wallet compliance gate. */
export async function quoteVault(vault: VaultDapp, wallet: Address, action: VaultAction, amount: bigint): Promise<VaultQuote> {
  if (!vault.actions.includes(action)) throw new HttpError(403, "This action is not enabled by the reviewed policy.");
  if (action === "revoke" ? amount !== 0n : amount <= 0n || amount >= 2n ** 256n - 1n) throw new HttpError(400, "Use a finite positive amount, or zero when revoking.");
  const snapshot = await readVaultSnapshot(vault, wallet);
  if (action === "deposit" && (amount > BigInt(snapshot.assetBalance) || amount > BigInt(snapshot.maxDeposit))) throw new HttpError(409, "The amount exceeds your available balance or the vault deposit limit.");
  if (action === "withdraw" && amount > BigInt(snapshot.maxWithdraw)) throw new HttpError(409, "The amount exceeds what you can withdraw from this vault.");
  const expectedOutput = action === "revoke" ? 0n : await publicClient.readContract({
    address: vault.address, abi: vaultReadAbi,
    functionName: action === "deposit" ? "previewDeposit" : "previewWithdraw", args: [amount], blockNumber: BigInt(snapshot.blockNumber),
  });
  if (action !== "revoke" && expectedOutput === 0n) throw new HttpError(409, "The amount is too small for this vault.");
  return { action, amount: amount.toString(), expectedOutput: expectedOutput.toString(), snapshot };
}
