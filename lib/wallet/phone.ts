// The phone's side of the protocol. It holds Share A and the passkey. To sign, it rebuilds the
// wallet key from A and Swissquote's B, then keeps the key in memory only: for three hours at
// most, and never past the app closing. It builds every call itself, and before Face ID signs it
// checks that Swissquote's operation carries that call, is sponsored, and hashes to what it signs.
import { WebAuthnP256 } from "ox";
import { encodeFunctionData, erc20Abi, isAddressEqual, numberToHex, parseUnits, type Address, type Hex } from "viem";
import { formatUserOperation, getUserOperationHash, type RpcUserOperation } from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress } from "viem/accounts";
import { accountAbi, bindRecoveryKeyMessage, cancelRecoveryMessage, encodeNormalSignature, type Passkey, type PasskeyAssertion } from "./account.ts";
import { combine, split, type Share } from "./shamir.ts";

export const KEY_TTL = 3 * 60 * 60 * 1000;

export type Authenticator = {
  create(name: string): Promise<Credential>;
  sign(credentialId: string, challenge: Hex): Promise<PasskeyAssertion>;
};
export type Credential = { id: string; passkey: Passkey };

/** What this phone keeps. Never the wallet key itself. */
export type Device = { credentialId: string; passkey: Passkey; share: Share; signer: Address; address?: Address };

export type WalletState = {
  address: Address;
  signer: Address;
  passkey: Passkey;
  recoveryKey: Address;
  usdc: string;
  pendingRecovery: { signer: Address; executeAfter: number } | null;
};

export type Identity = { document: string; selfie: string };

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type Config = { chainId: number; entryPoint: Address; usdc: Address };
type Prepared = { hash: Hex; userOp: RpcUserOperation<"0.7"> };

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === "string" ? body.error : `Request failed with ${status}.`);
    this.status = status;
    this.body = body;
  }
}

const DEVICE = "fuse.wallet.device";

/**
 * `partner` is pinned in the app build, never taken from Swissquote, so Swissquote cannot redirect
 * Share C to itself during the split.
 */
export function createPhone({ api = "", partner, authenticator, storage }: { api?: string; partner: string; authenticator: Authenticator; storage: Storage }) {
  let cached: { key: Hex; expiresAt: number; timer: ReturnType<typeof setTimeout> } | undefined;
  let config: Promise<Config> | undefined;

  async function call<T>(url: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
    const res = await fetch(url.startsWith("http") ? url : api + url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new ApiError(res.status, json);
    return json;
  }

  function getConfig() {
    config ??= call<Config>("/api/config").catch((error) => {
      config = undefined;
      throw error;
    });
    return config;
  }
  // ponytail: Share A sits in plain web storage; the native app keeps it in the Secure Enclave or Keystore.
  const device = (): Device | undefined => JSON.parse(storage.getItem(DEVICE) ?? "null") ?? undefined;
  const save = (d: Device) => storage.setItem(DEVICE, JSON.stringify(d));

  function requireWallet() {
    const d = device();
    if (!d?.address) throw new Error("This phone has no wallet.");
    return d as Device & { address: Address };
  }

  function forgetKey() {
    if (cached) clearTimeout(cached.timer);
    cached = undefined;
  }

  function remember(key: Hex) {
    forgetKey();
    const timer = setTimeout(forgetKey, KEY_TTL);
    // In Node (scripts, tests) the wipe timer must not keep the process alive for three hours.
    (timer as { unref?: () => void }).unref?.();
    cached = { key, expiresAt: Date.now() + KEY_TTL, timer };
  }

  // A throttled timer can fire late, so the expiry is checked on every use too.
  const cachedKey = () => (cached && Date.now() < cached.expiresAt ? cached.key : undefined);

  /** Rejects anything but this phone's call, sponsored so the wallet never pays gas, then hashes it itself. */
  async function verify({ hash, userOp }: Prepared, sender: Address, callData: Hex) {
    const { chainId, entryPoint } = await getConfig();
    const op = formatUserOperation(userOp);
    const ours =
      isAddressEqual(op.sender, sender) &&
      op.callData === callData &&
      !!op.paymaster &&
      getUserOperationHash({ chainId, entryPointAddress: entryPoint, entryPointVersion: "0.7", userOperation: op }) === hash;
    if (!ours) throw new Error("Swissquote returned a different operation than this phone built.");
  }

  /** Face ID approves the exact operation; the cached key, or one rebuilt from A and B, signs it. */
  /** The freshly split key names the recovery key that may release its shares, at both holders. */
  async function bind(signer: Address, recoveryKey: Address): Promise<Hex> {
    const key = cachedKey();
    if (!key) throw new Error("Split the wallet key again; this phone no longer has it in memory.");
    const signature = await privateKeyToAccount(key).signMessage({ message: bindRecoveryKeyMessage(signer, recoveryKey) });
    await call(`${partner}/shares/${signer}/recovery-key`, { recoveryKey, signature });
    return signature;
  }

  async function operate(callData: Hex): Promise<Hex> {
    const wallet = requireWallet();
    const prepared = await call<Prepared>(`/api/wallets/${wallet.address}/operations`, { callData });
    await verify(prepared, wallet.address, callData);
    const assertion = await authenticator.sign(wallet.credentialId, prepared.hash);
    let key = cachedKey();
    if (!key) {
      const wire = { metadata: assertion.metadata, signature: { r: numberToHex(assertion.signature.r), s: numberToHex(assertion.signature.s) } };
      const { share } = await call<{ share: Share }>(`/api/wallets/${wallet.address}/share`, { hash: prepared.hash, assertion: wire });
      key = combine(wallet.share, share);
      if (!isAddressEqual(privateKeyToAddress(key), wallet.signer)) throw new Error("Swissquote's share does not rebuild this phone's key.");
      remember(key);
    }
    const signature = encodeNormalSignature(await privateKeyToAccount(key).sign({ hash: prepared.hash }), assertion);
    const { transactionHash } = await call<{ transactionHash: Hex }>(`/api/wallets/${wallet.address}/operations/${prepared.hash}`, { signature });
    return transactionHash;
  }

  return {
    device,
    forgetKey,
    state: () => call<WalletState>(`/api/wallets/${requireWallet().address}`),

    /** Face ID creates the passkey that approves every payment. */
    createPasskey: (): Promise<Credential> => authenticator.create("Fuse"),

    /** Splits a fresh wallet key: B to Swissquote, C straight to the partner, A stays on this phone. */
    async splitKey(credential: Credential): Promise<Address> {
      const { key, shares, commitments } = split();
      const { signer, ticket } = await call<{ signer: Address; ticket: unknown }>("/api/shares", {
        commitments,
        passkey: credential.passkey,
        share: shares.swissquote,
      });
      await call(`${partner}/shares`, { ticket, share: shares.partner });
      save({ credentialId: credential.id, passkey: credential.passkey, share: shares.phone, signer });
      remember(key);
      return signer;
    },

    /** The key the client keeps at home. Only its address leaves this phone. */
    createRecoveryKey() {
      const secret = generatePrivateKey();
      return { secret, address: privateKeyToAddress(secret) };
    },

    async register(recoveryKey: Address): Promise<Address> {
      const d = device();
      if (!d) throw new Error("Split the wallet key first.");
      const signature = await bind(d.signer, recoveryKey);
      const { address } = await call<{ address: Address }>("/api/wallets", { signer: d.signer, recoveryKey, signature });
      save({ ...d, address });
      return address;
    },

    async sendUsdc(to: Address, amount: string): Promise<Hex> {
      const { usdc } = await getConfig();
      const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, parseUnits(amount, 6)] });
      return operate(encodeFunctionData({ abi: accountAbi, functionName: "execute", args: [usdc, 0n, data] }));
    },

    /** This phone still controls the wallet: it cancels a recovery someone started. */
    cancelRecovery: () => operate(encodeFunctionData({ abi: accountAbi, functionName: "cancelRecovery" })),

    /** Lost phone: after splitKey on the new phone, the recovery key starts the 48-hour recovery. */
    async startRecovery(secret: Hex, identity: Identity): Promise<{ address: Address; executeAfter: number }> {
      const d = device();
      if (!d) throw new Error("Split the new wallet key first.");
      const recovery = privateKeyToAccount(secret);
      const prepared = await call<Prepared & { address: Address }>("/api/recovery", {
        recoveryKey: recovery.address,
        signer: d.signer,
        signature: await bind(d.signer, recovery.address),
        identity,
      });
      await verify(prepared, prepared.address, encodeFunctionData({ abi: accountAbi, functionName: "initiateRecovery", args: [d.signer, d.passkey] }));
      const { executeAfter } = await call<{ executeAfter: number }>(`/api/wallets/${prepared.address}/recovery`, {
        hash: prepared.hash,
        signature: await recovery.sign({ hash: prepared.hash }),
      });
      save({ ...d, address: prepared.address });
      return { address: prepared.address, executeAfter };
    },

    /** Swissquote cancels the pending recovery for the client, who proves it with the recovery key. */
    async cancelRecoveryWithSwissquote(secret: Hex): Promise<Hex> {
      const { address } = requireWallet();
      const { pendingRecovery } = await call<WalletState>(`/api/wallets/${address}`);
      if (!pendingRecovery) throw new Error("There is no recovery to cancel.");
      const signature = await privateKeyToAccount(secret).signMessage({ message: cancelRecoveryMessage(address, pendingRecovery.executeAfter) });
      const { transactionHash } = await call<{ transactionHash: Hex }>(`/api/wallets/${address}/recovery`, { signature }, "DELETE");
      return transactionHash;
    },

    finalizeRecovery: () => call<{ transactionHash: Hex }>(`/api/wallets/${requireWallet().address}/recovery`, {}, "PATCH"),
  };
}

export type Phone = ReturnType<typeof createPhone>;

const browserAuthenticator: Authenticator = {
  async create(name) {
    const { id, publicKey } = await WebAuthnP256.createCredential({ name });
    return { id, passkey: { x: numberToHex(publicKey.x, { size: 32 }), y: numberToHex(publicKey.y!, { size: 32 }) } };
  },
  async sign(credentialId, challenge) {
    const { metadata, signature } = await WebAuthnP256.sign({ challenge, credentialId });
    return { metadata, signature };
  },
};

/** The app's phone. Storage is read lazily, so server rendering can import this module. */
export const phone = createPhone({
  partner: process.env.NEXT_PUBLIC_PARTNER_URL ?? "http://localhost:4002",
  authenticator: browserAuthenticator,
  storage: {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
  },
});
