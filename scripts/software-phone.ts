// Phones simulated in Node for npm run e2e and the CLI: the app's own phone module with a software passkey.
import { P256 } from "ox";
import { createWalletClient, http, parseAbi, parseEther, parseEventLogs, parseUnits, type Address, type Hex } from "viem";
import { entryPoint07Abi, toPackedUserOperation, type UserOperation } from "viem/account-abstraction";
import { privateKeyToAccount } from "viem/accounts";
import { addresses, chain, partnerUrl, publicClient, rpcUrl } from "../lib/wallet/env.ts";
import { createPhone, softwareAuthenticator } from "../lib/wallet/phone.ts";
import { DECIMALS, type PoolToken } from "../lib/wallet/pool.ts";

export const APP = process.env.APP_URL ?? "http://localhost:3000";

// Anvil's second prefunded account plays everyone who is not Swissquote: the exchange the client buys a few
// cents of ETH from, and the public bundler that carries the signed operation to the EntryPoint.
const BYSTANDER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const bystander = () => createWalletClient({ account: privateKeyToAccount(BYSTANDER_KEY), chain, transport: http(rpcUrl) });

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

/** `session`: the Swissquote session the phone is signed in with, once it has one. */
export function newPhone({
  passkey = P256.randomPrivateKey(),
  storage,
  session,
}: { passkey?: Hex; storage?: Storage; session?: () => string | undefined } = {}) {
  const items = new Map<string, string>();
  return createPhone({
    api: APP,
    partner: partnerUrl,
    pool: addresses.pool ?? undefined,
    authenticator: softwareAuthenticator(passkey, APP),
    storage: storage ?? { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) },
    exit: { rpc: rpcUrl, entryPoint: addresses.entryPoint, factory: addresses.factory, usdc: addresses.usdc, submit: bundle },
    session,
  });
}

/** Mints the deployment's test USDC, which anyone may mint, on any chain Deploy.s.sol deployed it to. */
export const mintUsdc = (to: Address, amount: string) => mint("usdc", to, amount);

/** Mints test USDC, or the test WETH the deployment's pool trades. `amount` is in whole tokens, like "100" or "0.5". */
export async function mint(token: PoolToken, to: Address, amount: string) {
  const address = addresses[token];
  if (!address) throw new Error("This deployment has no WETH or pool. A fresh deploy (npm run local, or npm run live fresh) gets them.");
  const swissquote = createWalletClient({ account: privateKeyToAccount(process.env.SWISSQUOTE_KEY as Hex), chain, transport: http(rpcUrl) });
  const hash = await swissquote.writeContract({
    address,
    abi: parseAbi(["function mint(address, uint256)"]),
    functionName: "mint",
    args: [to, parseUnits(amount, DECIMALS[token])],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function sendEth(to: Address, amount: string): Promise<void> {
  await publicClient.waitForTransactionReceipt({ hash: await bystander().sendTransaction({ to, value: parseEther(amount) }) });
}

/** What a public bundler does: handleOps from an account with ETH, which the EntryPoint repays from the wallet. */
export async function bundle(userOp: UserOperation<"0.7">): Promise<Hex> {
  const client = bystander();
  const hash = await client.writeContract({
    address: addresses.entryPoint,
    abi: entryPoint07Abi,
    functionName: "handleOps",
    args: [[toPackedUserOperation(userOp)], client.account.address],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const [event] = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs });
  if (!event?.args.success) throw new Error("The operation reverted.");
  return hash;
}
