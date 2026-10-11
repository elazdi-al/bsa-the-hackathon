// The phone's side of the protocol. It holds Share A and the passkey. To sign, it rebuilds the
// wallet key from A and Swissquote's B, then keeps the key in memory only: for three hours at
// most, and never past the app closing. It builds every call itself, and before Face ID signs it
// checks that Swissquote's operation carries that call, is sponsored, and hashes to what it signs,
// and reads from the sponsorship when it may leave, so a held payment shows its release time.
// If Swissquote's services are gone for good, it rebuilds the key from A and the partner's C and pays
// its own gas, without asking Swissquote anything.
import { P256, WebAuthnP256 } from "ox";
import {
  bytesToHex,
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  hexToBytes,
  http,
  isAddressEqual,
  numberToHex,
  parseUnits,
  sha256,
  type Address,
  type Hex,
} from "viem";
import {
  entryPoint07Abi,
  formatUserOperation,
  formatUserOperationRequest,
  getUserOperationHash,
  type RpcUserOperation,
  type UserOperation,
} from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress } from "viem/accounts";
import {
  ACCOUNT_GAS,
  accountAbi,
  bindRecoveryKeyMessage,
  cancelPaymentChallenge,
  cancelPaymentMessage,
  cancelRecoveryMessage,
  decodeSponsorship,
  encodeNormalSignature,
  encodeRecoverySignature,
  factoryAbi,
  type Config as AccountConfig,
  findWalletMessage,
  ownershipMessage,
  type Passkey,
  type PasskeyAssertion,
} from "./account.ts";
import { combine, split, type Share } from "./shamir.ts";
import type { ComplianceDecision } from "../compliance/types";
import { decisionAllowsSigning, type DappCatalog, type DappMetadata, type VaultAction, type VaultQuote, type VaultSnapshot } from "../dapps/model.ts";

export const KEY_TTL = 3 * 60 * 60 * 1000;

export type Authenticator = {
  create(name: string): Promise<Credential>;
  /** `secret` is the passkey's PRF output, where the authenticator has one: the key that seals Share A. */
  sign(credentialId: string, challenge: Hex): Promise<{ assertion: PasskeyAssertion; secret?: Uint8Array }>;
};
export type Credential = { id: string; passkey: Passkey };

/** Share A at rest: AES-GCM sealed under the passkey's PRF output, so only Face ID opens it. */
type StoredShare = Share | { x: Share["x"]; iv: Hex; sealed: Hex };

/**
 * What this phone keeps. Never the wallet key itself. `restoring`: this phone started a recovery of `address`
 * that hasn't handed it the wallet yet. `config`: what deploys the account, so an exit can deploy it without Swissquote.
 */
export type Device = {
  credentialId: string;
  passkey: Passkey;
  share: StoredShare;
  signer: Address;
  address?: Address;
  restoring?: boolean;
  config?: AccountConfig;
};

export type WalletState = {
  address: Address;
  signer: Address;
  passkey: Passkey;
  recoveryKey: Address;
  /** Swissquote locked the wallet's live credentials: the phone holding them was reported lost. */
  locked: boolean;
  usdc: string;
  pendingRecovery: { signer: Address; executeAfter: number } | null;
  /** The chain's time when read, in seconds. A local chain can run ahead of this phone's clock. */
  chainTime: number;
  /** Swissquote's record that the wallet is its client's. Only for that client, signed in on this phone: who owns a wallet is bank secrecy. */
  owner?: Owner;
  /** Large payments Swissquote holds, soonest first. */
  held: HeldPayment[];
};

/**
 * The Swissquote client this phone is signed in as, in the Swissquote app the wallet runs inside, with the number
 * of the ID card on file, which the app shows them and a recovery asks for. MOCKED: each phone signs in as its own
 * made-up client.
 */
export type SignedIn = { session: string; client: { number: string; name: string; document: string } };

/** The wallet key's signed statement that the wallet belongs to `client`, which Swissquote keeps as its ownership proof. */
export type Owner = { client: string; createdAt: number; statement: string; signature: Hex };

/**
 * A payment Swissquote holds until `releaseAt`, in chain seconds, which the client can cancel until it leaves.
 * `value` is in USDC base units; `stopped` says why it won't leave, when Swissquote's check at release refused it.
 */
export type HeldPayment = { hash: Hex; to: Address; value: string; releaseAt: number; stopped: string | null };

/** A USDC transfer in or out of the wallet. `value` is in base units. */
export type Transfer = { hash: Hex; from: Address; to: Address; value: string; timestamp: number };

/** What an ID check reads: the number on the ID card. MOCKED: typed, where a real check scans the card and the face. */
export type Identity = { document: string };

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
type Config = { chainId: number; entryPoint: Address; usdc: Address };
/** `releaseAt`: the chain time a held payment leaves, read by this phone from the sponsorship it signs. */
export type Prepared = { hash: Hex; userOp: RpcUserOperation<"0.7">; summary?: string[]; review?: ComplianceDecision; expiresAt?: string; releaseAt?: number };
/** On-chain, or held by Swissquote until `releaseAt` and cancellable by its operation `hash`. */
export type Sent = { transactionHash: Hex } | { hash: Hex; releaseAt: number };

/** What leaving without Swissquote needs, pinned in the app like `partner`: never fetched from Swissquote. */
export type ExitRoute = {
  rpc: string;
  entryPoint: Address;
  factory: Address;
  usdc: Address;
  /** Carries the signed operation to the EntryPoint: any account with ETH calling handleOps, or a public ERC-4337 bundler. Resolves once on-chain. */
  submit(userOp: UserOperation<"0.7">): Promise<Hex>;
};
export type ExitStatus = { alive: boolean; open: boolean; closedFor: number; exitAfter: number };

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === "string" ? body.error : `Request failed with ${status}.`);
    this.status = status;
    this.body = body;
  }
}

const DEVICE = "swissquote.wallet.device";
/** Where the app keeps the Swissquote session it is signed in with. */
export const SESSION = "swissquote.session";

/**
 * `partner` is pinned in the app build, never taken from Swissquote, so Swissquote cannot redirect
 * Share C to itself during the split. `session` is the Swissquote app's session this phone is signed in with
 * (MOCKED), which Swissquote's API gets on every call, so it answers as to its own client.
 */
export function createPhone({
  api = "",
  partner,
  authenticator,
  storage,
  exit,
  session,
}: {
  api?: string;
  partner: string;
  authenticator: Authenticator;
  storage: Storage;
  exit?: ExitRoute;
  session?: () => string | undefined;
}) {
  let cached: { key: Hex; expiresAt: number; timer: ReturnType<typeof setTimeout> } | undefined;
  let config: Promise<Config> | undefined;

  async function call<T>(url: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
    // Full URLs are the partner's: the bank session never goes there.
    const token = url.startsWith("http") ? undefined : session?.();
    const res = await fetch(url.startsWith("http") ? url : api + url, {
      method,
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { "x-swissquote-session": token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // A proxy or a crashed server can answer with HTML; that's a failed request, not a parse error.
    const json = await res.json().catch(() => ({}));
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

  /**
   * Rejects anything but this phone's call, sponsored so the wallet never pays gas, then hashes it itself. Any
   * nonce key will do: a held payment has one of its own. Resolves to when it may leave, if Swissquote holds it.
   */
  async function verify({ hash, userOp }: Prepared, sender: Address, callData: Hex): Promise<number | undefined> {
    const { chainId, entryPoint } = await getConfig();
    const op = formatUserOperation(userOp);
    const ours =
      isAddressEqual(op.sender, sender) &&
      op.callData === callData &&
      !!op.paymaster &&
      !!op.paymasterData &&
      getUserOperationHash({ chainId, entryPointAddress: entryPoint, entryPointVersion: "0.7", userOperation: op }) === hash;
    if (!ours) throw new Error("Swissquote returned a different operation than this phone built.");
    return decodeSponsorship(op.paymasterData!).validAfter || undefined;
  }

  /** The freshly split key signs a statement; the phone keeps it in memory for three hours at most. */
  function signWithKey(message: string): Promise<Hex> {
    const key = cachedKey();
    if (!key) throw new Error("Split the wallet key again; this phone no longer has it in memory.");
    return privateKeyToAccount(key).signMessage({ message });
  }

  /** The freshly split key names the recovery key that may release its shares, at both holders. */
  async function bind(signer: Address, recoveryKey: Address): Promise<Hex> {
    const signature = await signWithKey(bindRecoveryKeyMessage(signer, recoveryKey));
    await call(`${partner}/shares/${signer}/recovery-key`, { recoveryKey, signature });
    return signature;
  }

  /** Swissquote sponsors a call this phone built; the summary is its compliance reading of it. */
  async function prepare(call_: { to: Address; value?: bigint; data: Hex }, dapp?: DappMetadata): Promise<Prepared> {
    const wallet = requireWallet();
    const callData = encodeFunctionData({ abi: accountAbi, functionName: "execute", args: [call_.to, call_.value ?? 0n, call_.data] });
    const prepared = await call<Prepared>(`/api/wallets/${wallet.address}/operations`, { callData, ...(dapp ? { dapp } : {}) });
    return { ...prepared, releaseAt: await verify(prepared, wallet.address, callData) };
  }

  /**
   * Face ID approves the exact operation; the cached key, or one rebuilt from A and B, signs it. Resolves once it
   * is on-chain, or, for a payment Swissquote holds, once it is held.
   */
  async function approve(prepared: Prepared): Promise<Sent> {
    const wallet = requireWallet();
    if (prepared.expiresAt && (!Number.isFinite(Date.parse(prepared.expiresAt)) || Date.parse(prepared.expiresAt) <= Date.now())) throw new Error("This approval expired. Check the transaction again.");
    // Swissquote meets a step-up review by holding the payment: this phone read its release time from the sponsorship.
    const held = prepared.releaseAt !== undefined && prepared.review?.status === "STEP_UP";
    if (prepared.review && !held && !decisionAllowsSigning(prepared.review)) throw new Error("This compliance review does not authorize signing. Check the transaction again.");
    const { assertion, secret } = await authenticator.sign(wallet.credentialId, prepared.hash);
    let key = cachedKey();
    if (!key) {
      const { share } = await call<{ share: Share }>(`/api/wallets/${wallet.address}/share`, { hash: prepared.hash, assertion: wire(assertion) });
      key = rebuild(await unseal(wallet.share, secret, wallet.signer), share, wallet.signer);
      remember(key);
    }
    const signature = encodeNormalSignature(await privateKeyToAccount(key).sign({ hash: prepared.hash }), assertion);
    return call<Sent>(`/api/wallets/${wallet.address}/operations/${prepared.hash}`, { signature });
  }

  return {
    device,
    forgetKey,
    prepare,
    approve,
    config: getConfig,
    dapps: () => call<DappCatalog>("/api/dapps"),
    vaultSnapshot: (vault: Address, afterTx?: Hex) =>
      call<VaultSnapshot>(`/api/wallets/${requireWallet().address}/dapps/${vault}${afterTx ? `?afterTx=${afterTx}` : ""}`),
    quoteVault: (vault: Address, action: VaultAction, amount: bigint) =>
      call<VaultQuote>(`/api/wallets/${requireWallet().address}/dapps/${vault}`, { action, amount: amount.toString() }),
    hasWallet: () => !!device()?.address,
    async state(): Promise<WalletState> {
      const d = requireWallet();
      const state = await call<WalletState>(`/api/wallets/${d.address}`);
      // However the recovery was finished, once this phone's key is the wallet's, it's no longer restoring.
      if (d.restoring && isAddressEqual(state.signer, d.signer)) save({ ...d, restoring: undefined });
      return state;
    },
    activity: () => call<{ transfers: Transfer[] }>(`/api/wallets/${requireWallet().address}/activity`).then((r) => r.transfers),

    /** Removes the wallet from this phone: Share A, the passkey's record and the cached key. The wallet itself stays on-chain. */
    forget() {
      forgetKey();
      storage.removeItem(DEVICE);
    },

    /** Face ID creates the passkey that approves every payment. */
    // A unique name gives a unique WebAuthn user id, so a recovery passkey never replaces an older one on the same device.
    createPasskey: (): Promise<Credential> => authenticator.create(`Swissquote Wallet ${new Date().toISOString()}`),

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

    /** MOCKED: the Swissquote app's sign-in. Without a session Swissquote knows, the phone signs in as a new client. */
    signIn: (session?: string) => call<SignedIn>("/api/session", { session }),

    /** Registers the wallet for the signed-in client. The wallet key signs that the wallet is theirs, naming its address. */
    async register(recoveryKey: Address, { session, client }: SignedIn): Promise<Address> {
      const d = device();
      if (!d) throw new Error("Split the wallet key first.");
      const signature = await bind(d.signer, recoveryKey);
      const { address } = await call<{ address: Address }>(`/api/wallets?${new URLSearchParams({ signer: d.signer, recoveryKey })}`);
      const ownership = await signWithKey(ownershipMessage(client.number, address));
      const wallet = await call<{ address: Address; config: AccountConfig }>("/api/wallets", { signer: d.signer, recoveryKey, signature, session, ownership });
      save({ ...d, address: wallet.address, config: wallet.config });
      return wallet.address;
    },

    async sendUsdc(to: Address, amount: string): Promise<Sent> {
      const { usdc } = await getConfig();
      return approve(await prepare({ to: usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, parseUnits(amount, 6)] }) }));
    },

    /** Whether the partner has opened the exit: Swissquote unreachable or closed for long enough. */
    exitStatus: () => call<ExitStatus>(`${partner}/exit`),

    /**
     * Pays out with Swissquote gone: the wallet pays its own gas, the partner releases C for the operation Face ID
     * approves, and the exit route carries it on-chain. Only the chain and the partner are asked anything.
     */
    async exitUsdc(to: Address, amount: string): Promise<Hex> {
      if (!exit) throw new Error("This phone has no way out without Swissquote.");
      const wallet = requireWallet();
      const transfer = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, parseUnits(amount, 6)] });
      const callData = encodeFunctionData({ abi: accountAbi, functionName: "execute", args: [exit.usdc, 0n, transfer] });
      const client = createPublicClient({ transport: http(exit.rpc) });
      const [chainId, code, nonce, fees] = await Promise.all([
        client.getChainId(),
        client.getCode({ address: wallet.address }),
        client.readContract({ address: exit.entryPoint, abi: entryPoint07Abi, functionName: "getNonce", args: [wallet.address, 0n] }),
        client.estimateFeesPerGas(),
      ]);
      if (!code && !wallet.config) throw new Error("This phone can't deploy the wallet. It has no record of its setup.");
      const userOp: UserOperation<"0.7"> = {
        sender: wallet.address,
        nonce,
        callData,
        ...(code
          ? {}
          : { factory: exit.factory, factoryData: encodeFunctionData({ abi: factoryAbi, functionName: "createAccount", args: [wallet.config!, 0n] }) }),
        ...ACCOUNT_GAS,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        signature: "0x",
      };
      const hash = getUserOperationHash({ chainId, entryPointAddress: exit.entryPoint, entryPointVersion: "0.7", userOperation: userOp });
      const { assertion, secret } = await authenticator.sign(wallet.credentialId, hash);
      let key = cachedKey();
      if (!key) {
        const { share } = await call<{ share: Share }>(`${partner}/exit`, { userOp: formatUserOperationRequest(userOp), assertion: wire(assertion) });
        key = rebuild(await unseal(wallet.share, secret, wallet.signer), share, wallet.signer);
        remember(key);
      }
      const signature = encodeNormalSignature(await privateKeyToAccount(key).sign({ hash }), assertion);
      return exit.submit({ ...userOp, signature });
    },

    /** This phone still controls the wallet: it cancels a recovery someone started. */
    async cancelRecovery(): Promise<Sent> {
      return approve(await prepare({ to: requireWallet().address, data: encodeFunctionData({ abi: accountAbi, functionName: "cancelRecovery" }) }));
    },

    /**
     * Lost phone, after splitKey on the new phone. The recovery key signs the recovery; Swissquote
     * (B) and the partner (C) each check that and release their share to this phone, which rebuilds
     * the old key for this one signature. No one else ever holds B and C together. Swissquote's ID check, the number
     * on the owner's ID card matched to their KYC record, signs this phone in to Swissquote as the owner.
     */
    async startRecovery(secret: Hex, identity: Identity): Promise<{ address: Address; executeAfter: number; signedIn: SignedIn }> {
      const d = device();
      if (!d) throw new Error("Split the new wallet key first.");
      const recovery = privateKeyToAccount(secret);
      const prepared = await call<Prepared & { address: Address; signedIn: SignedIn }>("/api/recovery", {
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
      save({ ...d, address: prepared.address, restoring: true });
      const { pendingRecovery } = await call<WalletState>(`/api/wallets/${prepared.address}`);
      return { address: prepared.address, executeAfter: pendingRecovery!.executeAfter, signedIn: prepared.signedIn };
    },

    /**
     * The wallet a recovery key restores, the recovery already pending for it if someone started one, and whether
     * a Swissquote client owns it (`linked`), so its ID check can run. Nothing about that client.
     */
    async findRecovery(secret: Hex) {
      const at = Math.floor(Date.now() / 1000);
      const signature = await privateKeyToAccount(secret).signMessage({ message: findWalletMessage(at) });
      return call<{ address: Address; pendingRecovery: { executeAfter: number } | null; chainTime: number; linked: boolean }>(
        `/api/recovery?${new URLSearchParams({ signature, at: String(at) })}`,
      );
    },

    /**
     * Swissquote cancels the pending recovery for the client, who proves it with the recovery key. Works
     * without a wallet on this phone: the key's holder may have lost theirs and found a recovery underway.
     */
    async cancelRecoveryWithSwissquote(secret: Hex, address = requireWallet().address): Promise<Hex> {
      const { pendingRecovery } = await call<WalletState>(`/api/wallets/${address}`);
      if (!pendingRecovery) throw new Error("There is no recovery to cancel.");
      const signature = await privateKeyToAccount(secret).signMessage({ message: cancelRecoveryMessage(address, pendingRecovery.executeAfter) });
      const { transactionHash } = await call<{ transactionHash: Hex }>(`/api/wallets/${address}/recovery`, { signature }, "DELETE");
      return transactionHash;
    },

    finalizeRecovery: () => call<{ transactionHash: Hex }>(`/api/wallets/${requireWallet().address}/recovery`, {}, "PATCH"),

    /** Face ID asks Swissquote to cancel a payment it holds. */
    async cancelPayment(hash: Hex) {
      const wallet = requireWallet();
      const { assertion } = await authenticator.sign(wallet.credentialId, cancelPaymentChallenge(hash));
      await call(`/api/wallets/${wallet.address}/operations/${hash}`, { assertion: wire(assertion) }, "DELETE");
    },

    /** Swissquote cancels a held payment for the client, who proves it with the recovery key: the phone may be in a thief's hands. */
    async cancelPaymentWithSwissquote(secret: Hex, hash: Hex, address = requireWallet().address) {
      const signature = await privateKeyToAccount(secret).signMessage({ message: cancelPaymentMessage(address, hash) });
      await call(`/api/wallets/${address}/operations/${hash}`, { signature }, "DELETE");
    },

    /** Reports the phone that holds the wallet now as lost or stolen. After the owner's ID check Swissquote locks it; nothing changes on-chain. */
    async reportLost(identity: Identity): Promise<void> {
      await call(`/api/wallets/${requireWallet().address}/lock`, { identity });
    },
  };
}

/** A passkey assertion with its signature as hex, the way the API reads it. */
const wire = ({ metadata, signature }: PasskeyAssertion) => ({ metadata, signature: { r: numberToHex(signature.r), s: numberToHex(signature.s) } });

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

export async function unseal(stored: StoredShare, secret: Uint8Array | undefined, signer: Address): Promise<Share> {
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

/** The Recovery Key file the client keeps at home. `readRecoveryKey` reads it back. */
export const RECOVERY_FILE = {
  name: "Swissquote Wallet Recovery Key.txt",
  text: (secret: Hex) =>
    `Swissquote Wallet Recovery Key\n\n${secret}\n\nIf you lose your phone, this key restores your wallet on a new one, after Swissquote checks your ID and a 48-hour hold you can cancel. Keep it safe at home, not on your phone. Swissquote will never ask you to send it.`,
};

/** The recovery key inside a saved Recovery Key file, or undefined if it holds none. */
export const readRecoveryKey = (text: string) => text.match(/0x[0-9a-fA-F]{64}/)?.[0] as Hex | undefined;

export type Phone = ReturnType<typeof createPhone>;

const PRF_SALT = new TextEncoder().encode("Swissquote Wallet Share A v1");

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

/** A passkey in software, for phones simulated in Node and the iOS Simulator build. */
export function softwareAuthenticator(privateKey: Hex, origin: string): Authenticator {
  const { x, y } = P256.getPublicKey({ privateKey });
  const prf = sha256(privateKey, "bytes");
  return {
    create: async () => ({ id: "software", passkey: { x: numberToHex(x, { size: 32 }), y: numberToHex(y, { size: 32 }) } }),
    async sign(_id, challenge) {
      // The API checks rpId against the hostname it is reached at, so both follow the API's origin.
      const { metadata, payload } = WebAuthnP256.getSignPayload({ challenge, origin, rpId: new URL(origin).hostname });
      return { assertion: { metadata, signature: P256.sign({ payload, privateKey, hash: true }) }, secret: prf };
    },
  };
}

const PASSKEY = "swissquote.wallet.passkey";

// WebKit refuses real passkeys to an app without an associated domain, so the Simulator build keeps
// one in plain web storage. That build must never ship.
function simulatorPasskey() {
  let key = localStorage.getItem(PASSKEY) as Hex | null;
  if (!key) localStorage.setItem(PASSKEY, (key = P256.randomPrivateKey()));
  return softwareAuthenticator(key, process.env.NEXT_PUBLIC_API_URL || location.origin);
}

const simulatorAuthenticator: Authenticator = {
  create: (name) => simulatorPasskey().create(name),
  sign: (id, challenge) => simulatorPasskey().sign(id, challenge),
};

/** The app's phone. Storage is read lazily, so server rendering can import this module. */
export const phone = createPhone({
  api: process.env.NEXT_PUBLIC_API_URL ?? "",
  partner: process.env.NEXT_PUBLIC_PARTNER_URL ?? "http://localhost:4002",
  authenticator: process.env.NEXT_PUBLIC_SOFTWARE_PASSKEY === "1" ? simulatorAuthenticator : browserAuthenticator,
  storage: {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
  },
  session: () => (JSON.parse(localStorage.getItem(SESSION) ?? "null") as SignedIn | null)?.session,
});
