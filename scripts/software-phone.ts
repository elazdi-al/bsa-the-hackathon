// Phones simulated in Node for npm run e2e and the CLI: the app's own phone module with a software passkey.
import { P256, WebAuthnP256 } from "ox";
import { createWalletClient, http, numberToHex, parseAbi, parseUnits, sha256, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { addresses, chain, partnerUrl, publicClient, rpcUrl } from "../lib/wallet/env.ts";
import { createPhone, type Authenticator } from "../lib/wallet/phone.ts";

export const APP = process.env.APP_URL ?? "http://localhost:3000";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

/** A phone's passkey, in software. The app uses Face ID through WebAuthnP256 instead. */
export function softwareAuthenticator(privateKey: Hex): Authenticator {
  const { x, y } = P256.getPublicKey({ privateKey });
  const prf = sha256(privateKey, "bytes");
  return {
    create: async () => ({ id: "software", passkey: { x: numberToHex(x, { size: 32 }), y: numberToHex(y, { size: 32 }) } }),
    async sign(_id, challenge) {
      // The API checks rpId against the hostname it is reached at, so both follow APP_URL.
      const { metadata, payload } = WebAuthnP256.getSignPayload({ challenge, origin: APP, rpId: new URL(APP).hostname });
      return { assertion: { metadata, signature: P256.sign({ payload, privateKey, hash: true }) }, secret: prf };
    },
  };
}

export function newPhone({ passkey = P256.randomPrivateKey(), storage }: { passkey?: Hex; storage?: Storage } = {}) {
  const items = new Map<string, string>();
  return createPhone({
    api: APP,
    partner: partnerUrl,
    authenticator: softwareAuthenticator(passkey),
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
