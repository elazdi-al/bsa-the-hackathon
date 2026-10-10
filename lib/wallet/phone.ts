// The phone's side of the protocol. It holds Share A and the passkey. To sign, it rebuilds the
// wallet key from A and Swissquote's B, then keeps the key in memory only: for three hours at
// most, and never past the app closing. It builds every call itself, and before Face ID signs it
// checks that Swissquote's operation carries that call, is sponsored, and hashes to what it signs.
import { P256, WebAuthnP256 } from "ox";
import { bytesToHex, encodeFunctionData, erc20Abi, hexToBytes, isAddressEqual, numberToHex, parseUnits, sha256, type Address, type Hex } from "viem";
import { formatUserOperation, getUserOperationHash, type RpcUserOperation } from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress } from "viem/accounts";
import {
  accountAbi,
  bindRecoveryKeyMessage,
  cancelRecoveryMessage,
  encodeNormalSignature,
  encodeRecoverySignature,
  type Passkey,
  type PasskeyAssertion,
} from "./account.ts";
import { combine, split, type Share } from "./shamir.ts";

export const KEY_TTL = 3 * 60 * 60 * 1000;

export type Authenticator = {
  create(name: string): Promise<Credential>;
  /** `secret` is the passkey's PRF output, where the authenticator has one: the key that seals Share A. */
  sign(credentialId: string, challenge: Hex): Promise<{ assertion: PasskeyAssertion; secret?: Uint8Array }>;
};
export type Credential = { id: string; passkey: Passkey };

/** Share A at rest: AES-GCM sealed under the passkey's PRF output, so only Face ID opens it. */
type StoredShare = Share | { x: Share["x"]; iv: Hex; sealed: Hex };

/** What this phone keeps. Never the wallet key itself. */
export type Device = { credentialId: string; passkey: Passkey; share: StoredShare; signer: Address; address?: Address };

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
export type Prepared = { hash: Hex; userOp: RpcUserOperation<"0.7">; summary?: string[] };

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

  /** The freshly split key names the recovery key that may release its shares, at both holders. */
  async function bind(signer: Address, recoveryKey: Address): Promise<Hex> {
    const key = cachedKey();
    if (!key) throw new Error("Split the wallet key again; this phone no longer has it in memory.");
    const signature = await privateKeyToAccount(key).signMessage({ message: bindRecoveryKeyMessage(signer, recoveryKey) });
    await call(`${partner}/shares/${signer}/recovery-key`, { recoveryKey, signature });
    return signature;
  }

  /** Swissquote sponsors a call this phone built; the summary is its compliance reading of it. */
  async function prepare(call_: { to: Address; value?: bigint; data: Hex }): Promise<Prepared> {
    const wallet = requireWallet();
    const callData = encodeFunctionData({ abi: accountAbi, functionName: "execute", args: [call_.to, call_.value ?? 0n, call_.data] });
    const prepared = await call<Prepared>(`/api/wallets/${wallet.address}/operations`, { callData });
    await verify(prepared, wallet.address, callData);
    return prepared;
  }

  /** Face ID approves the exact operation; the cached key, or one rebuilt from A and B, signs it. Resolves once it is on-chain. */
  async function approve(prepared: Prepared): Promise<Hex> {
    const wallet = requireWallet();
    const { assertion, secret } = await authenticator.sign(wallet.credentialId, prepared.hash);
    let key = cachedKey();
    if (!key) {
      const wire = { metadata: assertion.metadata, signature: { r: numberToHex(assertion.signature.r), s: numberToHex(assertion.signature.s) } };
      const { share } = await call<{ share: Share }>(`/api/wallets/${wallet.address}/share`, { hash: prepared.hash, assertion: wire });
      key = rebuild(await unseal(wallet.share, secret, wallet.signer), share, wallet.signer);
      remember(key);
    }
    const signature = encodeNormalSignature(await privateKeyToAccount(key).sign({ hash: prepared.hash }), assertion);
    const { transactionHash } = await call<{ transactionHash: Hex }>(`/api/wallets/${wallet.address}/operations/${prepared.hash}`, { signature });
    return transactionHash;
  }

  return {
    device,
    forgetKey,
    prepare,
    approve,
    config: getConfig,
    hasWallet: () => !!device()?.address,
    state: () => call<WalletState>(`/api/wallets/${requireWallet().address}`),

    /** Face ID creates the passkey that approves every payment. */
    // A unique name gives a unique WebAuthn user id, so a recovery passkey never replaces an older one on the same device.
    createPasskey: (): Promise<Credential> => authenticator.create(`Fuse ${new Date().toISOString()}`),

    /** Splits a fresh wallet key: B to Swissquote, C straight to the partner, A sealed on this phone with Face ID. */
    async splitKey(credential: Credential): Promise<Address> {
      const { key, shares, commitments } = split();
      // Face ID first, while the tap's user activation still allows a WebAuthn prompt.
      const { secret } = await authenticator.sign(credential.id, generatePrivateKey());
      const { signer, ticket } = await call<{ signer: Address; ticket: unknown }>("/api/shares", {
        commitments,
        passkey: credential.passkey,
        share: shares.swissquote,
      });
      await call(`${partner}/shares`, { ticket, share: shares.partner });
      save({ credentialId: credential.id, passkey: credential.passkey, share: await seal(shares.phone, secret, signer), signer });
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
      return approve(await prepare({ to: usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, parseUnits(amount, 6)] }) }));
    },

    /** This phone still controls the wallet: it cancels a recovery someone started. */
    async cancelRecovery(): Promise<Hex> {
      return approve(await prepare({ to: requireWallet().address, data: encodeFunctionData({ abi: accountAbi, functionName: "cancelRecovery" }) }));
    },

    /**
     * Lost phone, after splitKey on the new phone. The recovery key signs the recovery; Swissquote
     * (B) and the partner (C) each check that and release their share to this phone, which rebuilds
     * the old key for this one signature. No one else ever holds B and C together.
     */
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
      const signature = await recovery.sign({ hash: prepared.hash });
      const b = await call<{ share: Share; signer: Address; approval: unknown }>(`/api/wallets/${prepared.address}/recovery`, { hash: prepared.hash, signature });
      const c = await call<{ share: Share }>(`${partner}/recovery`, { approval: b.approval, userOp: prepared.userOp, signature });
      const key = rebuild(b.share, c.share, b.signer);
      await call(`/api/wallets/${prepared.address}/operations/${prepared.hash}`, {
        signature: encodeRecoverySignature(await privateKeyToAccount(key).sign({ hash: prepared.hash }), signature),
      });
      save({ ...d, address: prepared.address });
      const { pendingRecovery } = await call<WalletState>(`/api/wallets/${prepared.address}`);
      return { address: prepared.address, executeAfter: pendingRecovery!.executeAfter };
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

const aesKey = (secret: Uint8Array) => crypto.subtle.importKey("raw", secret as Uint8Array<ArrayBuffer>, "AES-GCM", false, ["encrypt", "decrypt"]);
const aad = (signer: Address) => new TextEncoder().encode(signer.toLowerCase());
const bytes = (value: Hex) => hexToBytes(value) as Uint8Array<ArrayBuffer>;

// ponytail: an authenticator without PRF leaves Share A unsealed in web storage; the native app keeps it in the Secure Enclave.
async function seal(share: Share, secret: Uint8Array | undefined, signer: Address): Promise<StoredShare> {
  if (!secret) return share;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(signer) }, await aesKey(secret), bytes(share.y));
  return { x: share.x, iv: bytesToHex(iv), sealed: bytesToHex(new Uint8Array(sealed)) };
}

async function unseal(stored: StoredShare, secret: Uint8Array | undefined, signer: Address): Promise<Share> {
  if ("y" in stored) return stored;
  if (!secret) throw new Error("Face ID did not unlock Share A.");
  const params = { name: "AES-GCM", iv: bytes(stored.iv), additionalData: aad(signer) };
  return { x: stored.x, y: bytesToHex(new Uint8Array(await crypto.subtle.decrypt(params, await aesKey(secret), bytes(stored.sealed)))) };
}

/** Any two shares rebuild the wallet key, checked against the address the account expects. */
function rebuild(first: Share, second: Share, signer: Address): Hex {
  const key = combine(first, second);
  if (!isAddressEqual(privateKeyToAddress(key), signer)) throw new Error("These shares do not rebuild this wallet's key.");
  return key;
}

/** The recovery key inside a saved Recovery Key file, or undefined if it holds none. */
export const readRecoveryKey = (text: string) => text.match(/0x[0-9a-fA-F]{64}/)?.[0] as Hex | undefined;

export type Phone = ReturnType<typeof createPhone>;

const PRF_SALT = new TextEncoder().encode("Fuse Share A v1");

const browserAuthenticator: Authenticator = {
  async create(name) {
    const { id, publicKey } = await WebAuthnP256.createCredential({ name, extensions: { prf: { eval: { first: PRF_SALT } } } });
    return { id, passkey: { x: numberToHex(publicKey.x, { size: 32 }), y: numberToHex(publicKey.y!, { size: 32 }) } };
  },
  async sign(credentialId, challenge) {
    const { metadata, signature, raw } = await WebAuthnP256.sign({ challenge, credentialId, extensions: { prf: { eval: { first: PRF_SALT } } } });
    const prf = raw.getClientExtensionResults().prf?.results?.first;
    return { assertion: { metadata, signature }, secret: prf ? new Uint8Array(prf as ArrayBuffer) : undefined };
  },
};

const PASSKEYS = "fuse.wallet.passkeys";

/** The simulator's passkey. WebKit refuses real passkeys without an associated domain. The key sits in plain web storage, so this must never ship. */
export function softwareAuthenticator(storage: Storage, origin: () => string): Authenticator {
  const keys = (): Record<string, Hex> => JSON.parse(storage.getItem(PASSKEYS) ?? "{}");
  return {
    async create() {
      const id = crypto.randomUUID();
      const privateKey = P256.randomPrivateKey();
      storage.setItem(PASSKEYS, JSON.stringify({ ...keys(), [id]: privateKey }));
      const { x, y } = P256.getPublicKey({ privateKey });
      return { id, passkey: { x: numberToHex(x, { size: 32 }), y: numberToHex(y, { size: 32 }) } };
    },
    async sign(credentialId, challenge) {
      const privateKey = keys()[credentialId];
      if (!privateKey) throw new Error(`This phone has no passkey ${credentialId}.`);
      const { metadata, payload } = WebAuthnP256.getSignPayload({ challenge, origin: origin(), rpId: new URL(origin()).hostname });
      return { assertion: { metadata, signature: P256.sign({ payload, privateKey, hash: true }) }, secret: sha256(privateKey, "bytes") };
    },
  };
}

const webStorage: Storage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

/** The app's phone. Storage and `location` are read lazily, so server rendering can import this module. */
export const phone = createPhone({
  api: process.env.NEXT_PUBLIC_API_URL ?? "",
  partner: process.env.NEXT_PUBLIC_PARTNER_URL ?? "http://localhost:4002",
  authenticator: process.env.NEXT_PUBLIC_SOFTWARE_PASSKEY === "1" ? softwareAuthenticator(webStorage, () => location.origin) : browserAuthenticator,
  storage: webStorage,
});
