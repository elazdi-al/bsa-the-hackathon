// Chain and deployment config for server-side code: the Wallet API, the partner service and scripts.
import { createPublicClient, http, type Address } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { baseSepolia, foundry } from "viem/chains";
import { accountAbi, type Config } from "./account.ts";

const chains = { anvil: foundry, "base-sepolia": baseSepolia };
const chainName = (process.env.CHAIN ?? "anvil") as keyof typeof chains;
if (!chains[chainName]) throw new Error(`CHAIN must be one of ${Object.keys(chains).join(", ")}.`);
export const chain = chains[chainName];
export const rpcUrl = process.env.RPC_URL ?? chain.rpcUrls.default.http[0];
// Anvil mines on every transaction, so receipts are worth polling for almost at once.
export const publicClient = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: chain.id === foundry.id ? 100 : 1000 });
export const partnerUrl = process.env.PARTNER_URL ?? "http://localhost:4002";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Run npm run local, or see .env.example.`);
  return value as Address;
};

// Getters, so a build without a deployment still loads this module.
export const addresses = {
  get entryPoint() {
    return (process.env.ENTRY_POINT_ADDRESS ?? entryPoint07Address) as Address;
  },
  get factory() {
    return required("FACTORY_ADDRESS");
  },
  get paymaster() {
    return required("PAYMASTER_ADDRESS");
  },
  get usdc() {
    return required("USDC_ADDRESS");
  },
  /** The deployment's test WETH and USDC/WETH pool; null on a deployment made before the pool existed, like a resumed one. */
  get weth() {
    return (process.env.WETH_ADDRESS || null) as Address | null;
  },
  get pool() {
    return (process.env.POOL_ADDRESS || null) as Address | null;
  },
  /** Swissquote's key: paymaster signer, ticket signer, guardian and the account that submits operations. */
  get swissquote() {
    return required("SWISSQUOTE_ADDRESS");
  },
};

/**
 * Swissquote Plus: what one period costs, in USDC base units paid to Swissquote's address, and how long it lasts, in
 * chain seconds, so a warped local chain ages it.
 */
export const plus = { price: 10_000_000n, period: 30 * 24 * 60 * 60 };

type Credentials = Pick<Config, "signer" | "passkey" | "recoveryKey">;

/** Whether the account is on-chain yet: the first operation deploys it. */
export const isDeployed = async (wallet: Address) => !!(await publicClient.getCode({ address: wallet }));

/** The wallet's live credentials: on-chain once deployed, else its initial config. `deployed` saves a read when known. */
export async function credentials(
  wallet: Address,
  initial: () => Credentials | Promise<Credentials>,
  deployed = isDeployed(wallet),
): Promise<Credentials> {
  if (!(await deployed)) return initial();
  const read = <F extends "signer" | "passkey" | "recoveryKey">(functionName: F) =>
    publicClient.readContract({ address: wallet, abi: accountAbi, functionName });
  const [signer, [x, y], recoveryKey] = await Promise.all([read("signer"), read("passkey"), read("recoveryKey")]);
  return { signer, passkey: { x, y }, recoveryKey };
}

/** The chain's time now, in seconds. The pending block's: a local chain mines only on demand, so its latest block can be minutes old. */
export const chainNow = async () => Number((await publicClient.getBlock({ blockTag: "pending" })).timestamp);

/** The recovery waiting out its delay, if any. */
export async function pendingRecovery(wallet: Address, deployed = isDeployed(wallet)) {
  if (!(await deployed)) return null;
  const [signer, passkey, executeAfter] = await publicClient.readContract({ address: wallet, abi: accountAbi, functionName: "pendingRecovery" });
  return executeAfter ? { signer, passkey, executeAfter } : null;
}
