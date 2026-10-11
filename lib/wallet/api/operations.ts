// Builds, sponsors and submits UserOperations. Swissquote submits them to the EntryPoint
// itself and pays the gas through its paymaster, so the client never needs ETH. A payment its
// policy marks for step-up is held: sponsored only from 24 hours on, so the EntryPoint refuses it
// sooner, and kept by Swissquote, which the client can ask to cancel it until then.
import { randomBytes, randomUUID } from "node:crypto";
import {
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  isAddressEqual,
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
  decodeSponsorship,
  encodeSponsorship,
  factoryAbi,
  paymasterAbi,
  type Config,
  type Passkey,
} from "../account.ts";
import { addresses, chain, chainNow, credentials, isDeployed, partnerUrl, publicClient, rpcUrl } from "../env.ts";
import { address, passkey } from "../schema.ts";
import { store, type Held, type Kind, type Wallet } from "./db.ts";
import { HttpError } from "./http.ts";
import { refuseLocked } from "./locks.ts";

/** Read lazily, so a build without secrets works. */
export const swissquote = () => privateKeyToAccount(process.env.SWISSQUOTE_KEY as Hex);
const operator = () => createWalletClient({ account: swissquote(), chain, transport: http(rpcUrl) });

const GAS = { ...ACCOUNT_GAS, paymasterVerificationGasLimit: 100_000n, paymasterPostOpGasLimit: 0n };
// As long as a compliance decision lives, so a sponsored operation never outlives the decision behind it.
const SPONSORSHIP_TTL = 120n;
/** How long Swissquote holds a payment that needs step-up before it leaves. */
const HOLD = 24 * 60 * 60;
// Swissquote's sponsorship of a held payment lasts a week past its release, so a late release still goes through.
const HOLD_SPONSORSHIP = 7 * 24 * 60 * 60;

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

/**
 * Swissquote assists only operations its compliance policy allows; refusing never freezes the wallet itself.
 * `hold`: the policy asks for step-up, which Swissquote meets by holding the payment for 24 hours. `demo`: test
 * providers did the screening and simulation.
 */
export async function assist(wallet: Wallet, callData: Hex, dapp?: DappMetadata) {
  const call = decodeFunctionData({ abi: accountAbi, data: callData });
  await refuseLocked(wallet);
  if (call.functionName !== "execute") throw new HttpError(403, "The app can't make this call.");
  const [to, value, data] = call.args;
  if (isAddressEqual(to, wallet.address)) {
    if (!dapp && data === encodeFunctionData({ abi: accountAbi, functionName: "cancelRecovery" })) {
      return { summary: ["You cancel the pending recovery of your wallet."], hold: false, demo: false };
    }
    throw new HttpError(403, "The app can't change the account itself.");
  }
  const requestId = randomUUID();
  const { decision } = await getComplianceRuntime().engine.evaluate(
    { requestId, nonce: requestId, chainId: chain.id, account: wallet.address, calls: [{ to, value: value.toString(), data, operation: "CALL" }], ...(dapp ? { dapp } : {}) },
    { subject: wallet.address.toLowerCase() },
  );
  // Only a USDC payment can wait out a hold. Swissquote has no step-up for any other call, such as a dApp's, and refuses it.
  const hold = decision.status === "STEP_UP" && decision.decodedActions.every((a) => a.type === "TRANSFER" && isAddressEqual(a.contract, addresses.usdc));
  if (decision.status !== "ALLOW" && !hold) {
    throw new HttpError(403, "Swissquote can't sponsor this transaction.", {
      decision: { status: decision.status, reasons: decision.reasons.map((r) => r.message) },
      review: decision,
    });
  }
  return { summary: decision.summary, hold, demo: decision.assurance === "DEMO", review: decision };
}

const nonceOf = (sender: Address, key: bigint) =>
  publicClient.readContract({ address: addresses.entryPoint, abi: entryPoint07Abi, functionName: "getNonce", args: [sender, key] });

/**
 * Fills in nonce, gas, fees and Swissquote's sponsorship, and keeps the operation for submission. A held one
 * is sponsored only from 24 hours on, and takes a nonce key of its own so later payments don't use up its nonce.
 */
export async function prepare(wallet: Wallet, kind: Kind, callData: Hex, hold = false, decisionExpiresAt?: string) {
  // Deploying in a held operation would fail if a payment sent meanwhile deployed the account first.
  if (hold && !(await isDeployed(wallet.address))) await deploy(wallet);
  const key = hold ? BigInt(`0x${randomBytes(24).toString("hex")}`) : 0n;
  const [code, nonce, fees, block] = await Promise.all([
    publicClient.getCode({ address: wallet.address }),
    nonceOf(wallet.address, key),
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
    ...GAS,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    paymaster: addresses.paymaster,
    paymasterData: "0x",
    signature: "0x",
  };
  // The policy can use a shorter TTL than the paymaster. Never sponsor past its decision.
  const remaining = decisionExpiresAt ? Math.floor((Date.parse(decisionExpiresAt) - Date.now()) / 1000) : Number(SPONSORSHIP_TTL);
  if (!Number.isFinite(remaining) || remaining <= 0) throw new HttpError(410, "This compliance decision expired. Check it again.");
  const ttl = Math.min(remaining, Number(SPONSORSHIP_TTL));
  const validAfter = hold ? Number(block.timestamp) + HOLD : 0;
  const validUntil = hold ? validAfter + HOLD_SPONSORSHIP : Number(block.timestamp) + ttl;
  const sponsored = await publicClient.readContract({
    address: addresses.paymaster,
    abi: paymasterAbi,
    functionName: "getHash",
    args: [toPackedUserOperation(userOp), validUntil, validAfter],
  });
  userOp.paymasterData = encodeSponsorship(validUntil, validAfter, await swissquote().signMessage({ message: { raw: sponsored } }));
  const hash = getUserOperationHash({ chainId: chain.id, entryPointAddress: addresses.entryPoint, entryPointVersion: "0.7", userOperation: userOp });
  const rpc = formatUserOperationRequest(userOp);
  store().addOperation(hash, wallet.address, kind, rpc);
  return { hash, userOp: rpc, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
}

/** An operation Swissquote prepared and hasn't submitted yet, while its sponsorship lasts. */
export function loadOperation(wallet: Wallet, hash: Hex, kind?: Kind) {
  const row = store().operation(hash, wallet.address);
  if (!row || (kind && row.kind !== kind)) throw new HttpError(404, "No such operation.");
  if (Date.now() - row.createdAt > Number(SPONSORSHIP_TTL) * 1000) throw new HttpError(410, "This approval expired. Start again.");
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

/**
 * Runs the operation through the EntryPoint without sending it: in the pending block, whose time the next
 * transaction sees, or `at` a later chain time.
 */
function simulate(userOp: UserOperation<"0.7">, at?: number) {
  return publicClient
    .simulateContract({
      account: swissquote(),
      address: addresses.entryPoint,
      abi: entryPoint07Abi,
      functionName: "handleOps",
      args: [[toPackedUserOperation(userOp)], swissquote().address],
      ...(at === undefined ? { blockTag: "pending" as const } : { blockOverrides: { time: BigInt(at) } }),
    })
    .catch((error: unknown) => {
      throw new HttpError(422, "The operation would fail.", { detail: revertReason(error) });
    });
}

/** Simulates, then submits through the EntryPoint. Resolves once the operation succeeded on-chain. */
export function submit(userOp: UserOperation<"0.7">, signature: Hex): Promise<Hex> {
  return serialize(async () => {
    const { request } = await simulate({ ...userOp, signature });
    const transactionHash = await operator().writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    const [event] = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs });
    if (!event?.args.success) throw new HttpError(422, "The operation reverted.", { transactionHash });
    return transactionHash;
  });
}

/** Swissquote deploys the account itself: anyone may, and its address and config don't change. */
function deploy(wallet: Wallet) {
  return serialize(async () => {
    const hash = await operator().writeContract({
      address: addresses.factory,
      abi: factoryAbi,
      functionName: "createAccount",
      args: [wallet.config, 0n],
    });
    await publicClient.waitForTransactionReceipt({ hash });
  });
}

/** Keeps a signed payment until its release, once it is shown to go through then. */
export async function hold(wallet: Wallet, hash: Hex, userOp: UserOperation<"0.7">) {
  const { validAfter } = decodeSponsorship(userOp.paymasterData!);
  await simulate(userOp, validAfter);
  store().hold(hash, wallet.address, formatUserOperationRequest(userOp), validAfter);
  return { hash, releaseAt: validAfter };
}

/** The USDC transfer an `execute` carries, if that is what it is. Every held payment is one. */
function transferOf(callData: Hex) {
  const [to, , data] = decodeFunctionData({ abi: accountAbi, data: callData }).args as readonly [Address, bigint, Hex];
  if (!isAddressEqual(to, addresses.usdc)) return;
  const call = decodeFunctionData({ abi: erc20Abi, data });
  return call.functionName === "transfer" ? { to: call.args[0], value: call.args[1] } : undefined;
}

/** A held payment as the client sees it: who it pays, how much, and when it leaves. */
export function heldPayments(wallet: Wallet) {
  return store()
    .held(wallet.address)
    .map(({ hash, userOp, releaseAt, stopped }) => {
      const { to, value } = transferOf(userOp.callData)!;
      return { hash, to, value: value.toString(), releaseAt, stopped };
    });
}

const usdcAmount = (units: bigint) => new Intl.NumberFormat("en-US").format(Number(formatUnits(units, 6)));

/** Money a held payment will take when it leaves is not available to a new one. */
export async function requireAvailable(wallet: Wallet, callData: Hex) {
  const held = heldPayments(wallet).filter((p) => !p.stopped).reduce((sum, p) => sum + BigInt(p.value), 0n);
  const transfer = held ? transferOf(callData) : undefined;
  if (!transfer) return;
  const balance = await publicClient.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [wallet.address] });
  if (transfer.value > balance - held) {
    throw new HttpError(403, `Only ${usdcAmount(balance - held)} USDC is available. ${usdcAmount(held)} USDC is set aside for payments that haven't left yet.`);
  }
}

// Payments mid-release, so a cancel can't race one already on its way.
const releasing = new Set<Hex>();

/** The client cancels a held payment; Swissquote discards it. */
export function cancelHeld(wallet: Wallet, hash: Hex) {
  if (!store().heldPayment(hash, wallet.address)) throw new HttpError(404, "No such payment. It may have left already.");
  if (releasing.has(hash)) throw new HttpError(409, "This payment is leaving now.");
  store().unhold(hash);
}

/**
 * Sends the wallet's held payments whose time has come, after a fresh compliance check.
 * ponytail: runs when Swissquote next reads the wallet, which the app does every few seconds; a scheduler sends them on time in production.
 */
export async function releaseDue(wallet: Wallet) {
  if (!store().held(wallet.address).length) return;
  const now = await chainNow();
  for (const { hash } of store().held(wallet.address)) {
    // Read again: a cancel may have landed while an earlier payment went out.
    const payment = store().heldPayment(hash, wallet.address);
    if (!payment || payment.stopped || payment.releaseAt > now || releasing.has(hash)) continue;
    releasing.add(hash);
    await release(wallet, payment, now)
      .catch((error: unknown) => console.error(`Held payment ${hash} stays held:`, error))
      .finally(() => releasing.delete(hash));
  }
}

async function release(wallet: Wallet, { hash, userOp }: Held, now: number) {
  const op = formatUserOperation(userOp) as UserOperation<"0.7">;
  // Its nonce used means it went out already: an earlier release that crashed before forgetting it, or anyone else submitting it.
  if ((await nonceOf(op.sender, op.nonce >> 64n)) > op.nonce) return store().unhold(hash);
  if (now > decodeSponsorship(op.paymasterData!).validUntil) return store().stop(hash, "Its approval expired.");
  try {
    await assist(wallet, op.callData);
    await submit(op, op.signature);
    store().unhold(hash);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    const decision = error.body.decision as { status: string; reasons: string[] } | undefined;
    // REVIEW means the evidence isn't there right now, as when screening is down: try again on the next read.
    if (decision?.status === "REVIEW") return;
    // A lock on the phone that signed it is a reason the client can read as is.
    store().stop(hash, error.status === 423 ? error.message : decision?.reasons[0] ?? "Your wallet couldn't make this payment any more.");
  }
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

function revertReason(error: unknown) {
  const reverted = error instanceof BaseError ? error.walk((e) => e instanceof ContractFunctionRevertedError) : undefined;
  if (reverted instanceof ContractFunctionRevertedError && reverted.data) return `${reverted.data.errorName}(${(reverted.data.args ?? []).join(", ")})`;
  return error instanceof BaseError ? error.shortMessage : String(error);
}
