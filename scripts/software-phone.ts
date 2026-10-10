// Phones simulated in Node for npm run e2e and the CLI: the app's own phone module with a software passkey.
import { P256 } from "ox";
import { createWalletClient, http, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { addresses, chain, partnerUrl, publicClient, rpcUrl } from "../lib/wallet/env.ts";
import { createPhone, softwareAuthenticator } from "../lib/wallet/phone.ts";

export const APP = process.env.APP_URL ?? "http://localhost:3000";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

export function newPhone({ passkey = P256.randomPrivateKey(), storage }: { passkey?: Hex; storage?: Storage } = {}) {
  const items = new Map<string, string>();
  return createPhone({
    api: APP,
    partner: partnerUrl,
    authenticator: softwareAuthenticator(passkey, APP),
    storage: storage ?? { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) },
  });
}

export async function mintUsdc(to: Address, amount: string) {
  if (chain.id !== foundry.id) {
    console.log(`Minting only works on anvil. Get Base Sepolia USDC for ${to} at https://faucet.circle.com.`);
    return;
  }
  const swissquote = createWalletClient({ account: privateKeyToAccount(process.env.SWISSQUOTE_KEY as Hex), chain, transport: http(rpcUrl) });
  const hash = await swissquote.writeContract({
    address: addresses.usdc,
    abi: parseAbi(["function mint(address, uint256)"]),
    functionName: "mint",
    args: [to, parseUnits(amount, 6)],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}
