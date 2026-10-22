// Builds, sponsors and submits UserOperations. Swissquote submits them to the EntryPoint itself. For a wallet linked
// to a Swissquote client, and for every wallet's recovery, it pays the gas through its paymaster, so that client never
// needs ETH; an unlinked wallet pays its own from its ETH.
import { randomUUID } from "node:crypto";
import {
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  decodeErrorResult,
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  getAbiItem,
  http,
  isAddressEqual,
  parseAbi,
  parseEventLogs,
  recoverMessageAddress,
  type Address,
  type Hex,
} from "viem";
import {
  entryPoint07Abi,
  formatUserOperation,
  formatUserOperationRequest,
  getUserOperationHash,
  toPackedUserOperation,
  type UserOperation,
} from "viem/account-abstraction";
import { privateKeyToAccount } from "viem/accounts";
import * as z from "zod";
import { getComplianceRuntime } from "@/services/compliance/runtime";
import type { DappMetadata } from "../../dapps/model";
import {
  ACCOUNT_GAS,
  accountAbi,
  bindRecoveryKeyMessage,
  encodeSponsorship,
  ethAmount,
  factoryAbi,
  maxFee,
  paymasterAbi,
  type Config,
  type Passkey,
} from "../account.ts";
import { addresses, chain, chainNow, credentials, isDeployed, partnerUrl, publicClient, rpcUrl } from "../env.ts";
import { poolAbi } from "../pool.ts";
import { address, passkey } from "../schema.ts";
import { store, type Kind, type Wallet } from "./db.ts";
import { HttpError } from "./http.ts";
import { refuseLocked } from "./locks.ts";

/** Read lazily, so a build without secrets works. */
export const swissquote = () => privateKeyToAccount(process.env.SWISSQUOTE_KEY as Hex);
const operator = () => createWalletClient({ account: swissquote(), chain, transport: http(rpcUrl) });

const PAYMASTER_GAS = { paymasterVerificationGasLimit: 100_000n, paymasterPostOpGasLimit: 0n };
/** Seconds a sponsorship lasts: as long as a compliance decision lives, so it never outlives the decision behind it. */
const sponsorshipTtl = () => getComplianceRuntime().engine.policy.decisionTtlSeconds;
/** So its free gas can't be farmed, Swissquote refuses a payment once it paid for this many of the wallet's operations in an hour of chain time. */
const SPONSORED_PER_HOUR = 20;
// ponytail: counts what the paymaster paid in the last 5,000 blocks, hours on Base; an indexer replaces the scan at scale.
const SPONSORED_LOOKBACK = 5_000n;

export function walletConfig(signer: Address, passkey: Passkey, recoveryKey: Address): Config {
  return { signer, passkey, recoveryKey, guardian: swissquote().address };
}

export const predictAddress = (config: Config) =>
  publicClient.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "getAddress", args: [config, 0n] });

export function requireWallet(address: Address): Wallet {
  const wallet = store().wallet(address);
  if (!wallet) throw new HttpError(404, "No wallet at that address.");
  return wallet;
}

export const liveCredentials = (wallet: Wallet, deployed?: Promise<boolean>) => credentials(wallet.address, () => wallet.config, deployed);

/** Calls the partner. Silence or a refusal becomes an HttpError, never a raw failure. */
async function partner<T extends z.ZodType>(path: string, reply: T, body?: unknown): Promise<z.infer<T>> {
  const res = await fetch(partnerUrl + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    throw new HttpError(503, "The independent service is unreachable.");
  });
  const json = await res.json().catch(() => undefined);
  if (!res.ok) throw new HttpError(409, "The independent service refused.", { detail: json?.error });
  const parsed = reply.safeParse(json);
  if (!parsed.success) throw new HttpError(502, "The independent service answered something unexpected.");
  return parsed.data;
}

/**
 * The wallet key itself names the recovery key that may release its shares. Swissquote records
 * it for Share B and checks the partner recorded the same for Share C. Resolves to Share B's record.
 */
export async function bindShares(signer: Address, recoveryKey: Address, signature: Hex) {
  const by = await recoverMessageAddress({ message: bindRecoveryKeyMessage(signer, recoveryKey), signature });
  if (!isAddressEqual(by, signer)) throw new HttpError(403, "The wallet key did not sign this recovery key.");
  if (!store().shares.bind(signer, recoveryKey)) throw new HttpError(409, "Swissquote holds no share of that key, or it has another recovery key.");
  const b = store().shares.get(signer)!;
  const c = await partner(`/shares/${signer}`, z.object({ passkey, recoveryKey: address.nullable() }));
  if (c.passkey.x !== b.passkey.x || c.passkey.y !== b.passkey.y || !c.recoveryKey || !isAddressEqual(c.recoveryKey, recoveryKey)) {
    throw new HttpError(409, "The independent service holds no share of that key for this recovery key.");
  }
  return b;
}

type Call = { target: Address; value: bigint; data: Hex };

/** The calls an operation makes: one through `execute`, several through `executeBatch`. Anything else is refused. */
function callsOf(callData: Hex): readonly Call[] {
  const call = decodeFunctionData({ abi: accountAbi, data: callData });
  if (call.functionName === "execute") return [{ target: call.args[0], value: call.args[1], data: call.args[2] }];
  if (call.functionName === "executeBatch" && call.args[0].length) return call.args[0];
  throw new HttpError(403, "The app can't make this call.");
}

/**
 * Swissquote assists only operations its compliance policy allows, every call of a batch included; refusing never
 * freezes the wallet itself. Of calls to the account itself, only a lone cancelRecovery passes.
 * `demo`: test providers did the screening and simulation.
 */
export async function assist(wallet: Wallet, callData: Hex, dapp?: DappMetadata) {
  await refuseLocked(wallet);
  const calls = callsOf(callData);
  if (calls.some(({ target }) => isAddressEqual(target, wallet.address))) {
    if (!dapp && calls.length === 1 && calls[0].data === encodeFunctionData({ abi: accountAbi, functionName: "cancelRecovery" })) {
      return { summary: ["You cancel the pending recovery of your wallet."], demo: false };
    }
    throw new HttpError(403, "The app can't change the account itself.");
  }
  const requestId = randomUUID();
  const { decision } = await getComplianceRuntime().engine.evaluate(
    {
      requestId,
      nonce: requestId,
      chainId: chain.id,
      account: wallet.address,
      calls: calls.map(({ target, value, data }) => ({ to: target, value: value.toString(), data, operation: "CALL" as const })),
      ...(dapp ? { dapp } : {}),
    },
    { subject: wallet.address.toLowerCase() },
  );
  if (decision.status !== "ALLOW") {
    throw new HttpError(403, "Swissquote can't sponsor this transaction.", {
      decision: { status: decision.status, reasons: decision.reasons.map((r) => r.message) },
      review: decision,
    });
  }
  return { summary: decision.summary, demo: decision.assurance === "DEMO", review: decision };
}

const nonceOf = (sender: Address, key: bigint) =>
  publicClient.readContract({ address: addresses.entryPoint, abi: entryPoint07Abi, functionName: "getNonce", args: [sender, key] });

/**
 * Swissquote pays the gas for a wallet linked to its client, and for every wallet's recovery: starting one, and
 * cancelling one from the phone, the only call to the account itself `assist` lets through. So a lost phone never
 * leaves a wallet unrecoverable for lack of ETH. Swissquote finishes a recovery itself, with `callAccount`.
 */
function sponsors(wallet: Wallet, kind: Kind, callData: Hex) {
  if (kind === "recovery" || store().owner(wallet.address)) return true;
  return callsOf(callData).every(({ target }) => isAddressEqual(target, wallet.address));
}

/** Fills in nonce, gas, fees and, if Swissquote pays the gas, its sponsorship, and keeps the operation for submission. */
export async function prepare(wallet: Wallet, kind: Kind, callData: Hex, decisionExpiresAt?: string) {
  const sponsored = sponsors(wallet, kind, callData);
  const [code, nonce, fees, block] = await Promise.all([
    publicClient.getCode({ address: wallet.address }),
    nonceOf(wallet.address, 0n),
    publicClient.estimateFeesPerGas(),
    // The pending block, not the latest: an idle local chain's latest block can be minutes old, which would
    // start the sponsorship already expired.
    publicClient.getBlock({ blockTag: "pending" }),
  ]);
  const userOp: UserOperation<"0.7"> = {
    sender: wallet.address,
    nonce,
    callData,
    ...(code
      ? {}
      : { factory: addresses.factory, factoryData: encodeFunctionData({ abi: factoryAbi, functionName: "createAccount", args: [wallet.config, 0n] }) }),
    ...ACCOUNT_GAS,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    ...(sponsored ? { ...PAYMASTER_GAS, paymaster: addresses.paymaster, paymasterData: "0x" as Hex } : {}),
    signature: "0x",
  };
  // The policy can use a shorter TTL than the paymaster. Never sponsor past its decision.
  const remaining = decisionExpiresAt ? Math.floor((Date.parse(decisionExpiresAt) - Date.now()) / 1000) : sponsorshipTtl();
  if (!Number.isFinite(remaining) || remaining <= 0) throw new HttpError(410, "This compliance decision expired. Check it again.");
  const ttl = Math.min(remaining, sponsorshipTtl());
  if (sponsored) {
    const validUntil = Number(block.timestamp) + ttl;
    const sponsorship = await publicClient.readContract({
      address: addresses.paymaster,
      abi: paymasterAbi,
      functionName: "getHash",
      args: [toPackedUserOperation(userOp), validUntil, 0],
    });
    userOp.paymasterData = encodeSponsorship(validUntil, await swissquote().signMessage({ message: { raw: sponsorship } }));
  } else await requireGas(wallet, userOp);
  const hash = getUserOperationHash({ chainId: chain.id, entryPointAddress: addresses.entryPoint, entryPointVersion: "0.7", userOperation: userOp });
  const rpc = formatUserOperationRequest(userOp);
  store().pruneOperations(Date.now() - sponsorshipTtl() * 1000);
  store().addOperation(hash, wallet.address, kind, rpc);
  return { hash, userOp: rpc, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
}

/** An operation Swissquote doesn't sponsor pays its gas from the wallet's ETH, and from what earlier ones left at the EntryPoint. */
async function requireGas(wallet: Wallet, userOp: UserOperation<"0.7">) {
  const fee = maxFee(userOp);
  const [eth, deposit] = await Promise.all([
    publicClient.getBalance({ address: wallet.address }),
    publicClient.readContract({ address: addresses.entryPoint, abi: entryPoint07Abi, functionName: "balanceOf", args: [wallet.address] }),
  ]);
  if (eth + deposit < fee) {
    throw new HttpError(
      403,
      `Your wallet needs up to ${ethAmount(fee)} ETH for the network fee. Add ETH to your wallet, or link your Swissquote account in Settings and Swissquote pays it.`,
      { refused: "gas" },
    );
  }
}

/** An operation Swissquote prepared and hasn't submitted yet, while its sponsorship lasts. */
export function loadOperation(wallet: Wallet, hash: Hex, kind?: Kind) {
  const row = store().operation(hash, wallet.address);
  if (!row || (kind && row.kind !== kind)) throw new HttpError(404, "No such operation.");
  if (Date.now() - row.createdAt > sponsorshipTtl() * 1000) throw new HttpError(410, "This approval expired. Start again.");
  return formatUserOperation(row.userOp) as UserOperation<"0.7">;
}

/**
 * Loads an operation for submission and forgets it, so it's submitted once. Once on-chain, its hash and
 * passkey assertion are public, and they must not keep unlocking Share B.
 */
export function takeOperation(wallet: Wallet, hash: Hex) {
  const userOp = loadOperation(wallet, hash);
  store().removeOperation(hash);
  return userOp;
}

// ponytail: one transaction at a time keeps Swissquote's own nonces in order; a nonce manager lifts it.
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

/** Runs the operation through the EntryPoint without sending it, in the pending block, whose time the next transaction sees. */
function simulate(userOp: UserOperation<"0.7">) {
  return publicClient
    .simulateContract({
      account: swissquote(),
      address: addresses.entryPoint,
      abi: entryPoint07Abi,
      functionName: "handleOps",
      args: [[toPackedUserOperation(userOp)], swissquote().address],
      blockTag: "pending",
    })
    .catch((error: unknown) => {
      throw new HttpError(422, "The operation would fail.", { detail: revertReason(error) });
    });
}

/** Simulates, then submits through the EntryPoint. Resolves once the operation succeeded on-chain. */
export function submit(userOp: UserOperation<"0.7">, signature: Hex): Promise<Hex> {
  return serialize(async () => {
    // handleOps succeeds even when the account's own call reverts, and Swissquote's paymaster would pay for the
    // failure. A deployed account's call is tried first, as the EntryPoint makes it, so a moved price fails here.
    if (await isDeployed(userOp.sender)) {
      await publicClient.call({ account: addresses.entryPoint, to: userOp.sender, data: userOp.callData }).catch((error: unknown) => {
        const data = error instanceof BaseError ? (error.walk((e) => typeof (e as { data?: unknown }).data === "string") as { data?: Hex } | null)?.data : undefined;
        throw new HttpError(422, "The operation would fail.", { detail: data ? callError(data) : revertReason(error) });
      });
    }
    const { request } = await simulate({ ...userOp, signature });
    const transactionHash = await operator().writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    const [event] = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs });
    if (!event?.args.success) {
      // The account bubbles up the failing call's revert, like a swap's Slippage when the price moved.
      const [reverted] = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationRevertReason", logs: receipt.logs });
      throw new HttpError(422, "The operation reverted.", { transactionHash, detail: reverted && callError(reverted.args.revertReason) });
    }
    return transactionHash;
  });
}

/** The USDC transfers an operation carries, if any of its calls is one. */
function transfersOf(callData: Hex) {
  return callsOf(callData).flatMap(({ target, data }) => {
    if (!isAddressEqual(target, addresses.usdc)) return [];
    const call = decodeFunctionData({ abi: erc20Abi, data });
    return call.functionName === "transfer" ? [{ to: call.args[0], value: call.args[1] }] : [];
  });
}

/**
 * Swissquote refuses to pay for a payment of 0, or for any operation, a dApp call too, once its paymaster paid for
 * SPONSORED_PER_HOUR of the wallet's operations in the last hour, counted on-chain. Cancelling a recovery is never refused.
 */
export async function requireSponsorable(wallet: Wallet, callData: Hex) {
  if (callsOf(callData).every(({ target }) => isAddressEqual(target, wallet.address))) return;
  if (transfersOf(callData).some(({ value }) => value === 0n)) throw new HttpError(403, "Swissquote doesn't pay for a payment of 0 USDC.");
  const latest = await publicClient.getBlockNumber();
  const paid = await publicClient.getLogs({
    address: addresses.entryPoint,
    event: getAbiItem({ abi: entryPoint07Abi, name: "UserOperationEvent" }),
    args: { sender: wallet.address, paymaster: addresses.paymaster },
    fromBlock: latest > SPONSORED_LOOKBACK ? latest - SPONSORED_LOOKBACK : 0n,
  });
  // The hour frees up once the oldest of the last SPONSORED_PER_HOUR is an hour old.
  const oldest = paid.at(-SPONSORED_PER_HOUR);
  if (!oldest) return;
  const wait = Number((await publicClient.getBlock({ blockHash: oldest.blockHash })).timestamp) + 3600 - (await chainNow());
  if (wait <= 0) return;
  const minutes = Math.ceil(wait / 60);
  throw new HttpError(
    429,
    `Swissquote pays the network fee for up to ${SPONSORED_PER_HOUR} payments an hour. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
  );
}

/** Swissquote calls the account itself: to cancel a recovery as guardian, or to finalize one, which anyone may. */
export function callAccount(wallet: Address, functionName: "cancelRecovery" | "finalizeRecovery"): Promise<Hex> {
  return serialize(async () => {
    const { request } = await publicClient
      // Against the pending block: the delay is measured in chain time, which the latest block of an idle local chain lags.
      .simulateContract({ account: swissquote(), address: wallet, abi: accountAbi, functionName, blockTag: "pending" })
      .catch((error: unknown) => {
        throw new HttpError(409, functionName === "finalizeRecovery" ? "The recovery can't be finalized yet." : "There is no recovery to cancel.", {
          detail: revertReason(error),
        });
      });
    const transactionHash = await operator().writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    return transactionHash;
  });
}

const callErrors = [
  ...poolAbi,
  ...parseAbi([
    "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
    "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  ]),
];

function callError(data: Hex) {
  try {
    const { errorName, args } = decodeErrorResult({ abi: callErrors, data });
    return `${errorName}(${args?.join(", ") ?? ""})`;
  } catch {
    return data;
  }
}

function revertReason(error: unknown) {
  const reverted = error instanceof BaseError ? error.walk((e) => e instanceof ContractFunctionRevertedError) : undefined;
  if (reverted instanceof ContractFunctionRevertedError && reverted.data) return `${reverted.data.errorName}(${(reverted.data.args ?? []).join(", ")})`;
  return error instanceof BaseError ? error.shortMessage : String(error);
}
