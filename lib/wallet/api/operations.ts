// Builds, sponsors and submits UserOperations. Swissquote submits them to the EntryPoint
// itself and pays the gas through its paymaster, so the client never needs ETH.
import { randomUUID } from "node:crypto";
import {
  BaseError,
  ContractFunctionRevertedError,
  concat,
  createWalletClient,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  isAddressEqual,
  parseEventLogs,
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
import { getComplianceRuntime } from "@/services/compliance/runtime";
import { accountAbi, factoryAbi, paymasterAbi, type Config, type Passkey } from "../account.ts";
import { addresses, chain, credentials, partnerUrl, publicClient, rpcUrl } from "../env.ts";
import { combine, type Share } from "../shamir.ts";
import { signTicket } from "../tickets.ts";
import { store, type Kind, type Wallet } from "./db.ts";
import { HttpError } from "./http.ts";

/** Read lazily, so a build without secrets works. */
export const swissquote = () => privateKeyToAccount(process.env.SWISSQUOTE_KEY as Hex);
const operator = () => createWalletClient({ account: swissquote(), chain, transport: http(rpcUrl) });

// ponytail: fixed limits sized for a first operation that deploys the account plus a token
// transfer with on-chain P-256 verification; estimate per operation once dApp calls need more.
const GAS = {
  callGasLimit: 300_000n,
  verificationGasLimit: 1_000_000n,
  preVerificationGas: 50_000n,
  paymasterVerificationGasLimit: 100_000n,
  paymasterPostOpGasLimit: 0n,
};
const SPONSORSHIP_TTL = 300n;

export function walletConfig(signer: Address, passkey: Passkey, recoveryKey: Address): Config {
  return { signer, passkey, recoveryKey, guardian: swissquote().address, rules: [addresses.spendingLimitRule] };
}

export const predictAddress = (config: Config) =>
  publicClient.readContract({ address: addresses.factory, abi: factoryAbi, functionName: "getAddress", args: [config, 0n] });

export function requireWallet(address: Address): Wallet {
  const wallet = store().wallet(address);
  if (!wallet) throw new HttpError(404, "No wallet at that address.");
  return wallet;
}

export const liveCredentials = (wallet: Wallet) => credentials(wallet.address, () => wallet.config);

/** Swissquote assists only operations its compliance policy allows; refusing never freezes the wallet itself. */
export async function assist(wallet: Wallet, callData: Hex) {
  const call = decodeFunctionData({ abi: accountAbi, data: callData });
  if (call.functionName === "cancelRecovery") return ["You cancel the pending recovery of your wallet."];
  if (call.functionName !== "execute") throw new HttpError(403, "The app can't make this call.");
  const [to, value, data] = call.args;
  const requestId = randomUUID();
  const { decision } = await getComplianceRuntime().engine.evaluate(
    { requestId, nonce: requestId, chainId: chain.id, account: wallet.address, calls: [{ to, value: value.toString(), data, operation: "CALL" }] },
    { subject: wallet.address.toLowerCase() },
  );
  if (decision.status !== "ALLOW") {
    throw new HttpError(403, "Swissquote can't sponsor this transaction.", {
      decision: { status: decision.status, reasons: decision.reasons.map((r) => r.message) },
    });
  }
  return decision.summary;
}

/** Fills in nonce, gas, fees and Swissquote's sponsorship, and keeps the operation for submission. */
export async function prepare(wallet: Wallet, kind: Kind, callData: Hex) {
  const [code, nonce, fees, block] = await Promise.all([
    publicClient.getCode({ address: wallet.address }),
    publicClient.readContract({ address: addresses.entryPoint, abi: entryPoint07Abi, functionName: "getNonce", args: [wallet.address, 0n] }),
    publicClient.estimateFeesPerGas(),
    publicClient.getBlock(),
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
  const validUntil = Number(block.timestamp + SPONSORSHIP_TTL);
  const sponsored = await publicClient.readContract({
    address: addresses.paymaster,
    abi: paymasterAbi,
    functionName: "getHash",
    args: [toPackedUserOperation(userOp), validUntil, 0],
  });
  userOp.paymasterData = concat([
    encodeAbiParameters([{ type: "uint48" }, { type: "uint48" }], [validUntil, 0]),
    await swissquote().signMessage({ message: { raw: sponsored } }),
  ]);
  const hash = getUserOperationHash({ chainId: chain.id, entryPointAddress: addresses.entryPoint, entryPointVersion: "0.7", userOperation: userOp });
  const rpc = formatUserOperationRequest(userOp);
  store().addOperation(hash, wallet.address, kind, rpc);
  return { hash, userOp: rpc };
}

export function loadOperation(wallet: Wallet, hash: Hex, kind: Kind) {
  const row = store().operation(hash, wallet.address);
  if (row?.kind !== kind) throw new HttpError(404, "No such operation.");
  return formatUserOperation(row.userOp) as UserOperation<"0.7">;
}

// ponytail: one transaction at a time keeps Swissquote's own nonces in order; a nonce manager lifts it.
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
}

/** Simulates, then submits through the EntryPoint. Resolves once the operation succeeded on-chain. */
export function submit(userOp: UserOperation<"0.7">, signature: Hex): Promise<Hex> {
  return serialize(async () => {
    const { request } = await publicClient
      .simulateContract({
        account: swissquote(),
        address: addresses.entryPoint,
        abi: entryPoint07Abi,
        functionName: "handleOps",
        args: [[toPackedUserOperation({ ...userOp, signature })], swissquote().address],
      })
      .catch((error: unknown) => {
        throw new HttpError(422, "The operation would fail.", { detail: revertReason(error) });
      });
    const transactionHash = await operator().writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    const [event] = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs });
    if (!event?.args.success) throw new HttpError(422, "The operation reverted.", { transactionHash });
    return transactionHash;
  });
}

/** Swissquote calls the account itself: to cancel a recovery as guardian, or to finalize one, which anyone may. */
export function callAccount(wallet: Address, functionName: "cancelRecovery" | "finalizeRecovery"): Promise<Hex> {
  return serialize(async () => {
    const { request } = await publicClient
      .simulateContract({ account: swissquote(), address: wallet, abi: accountAbi, functionName })
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
  if (reverted instanceof ContractFunctionRevertedError && reverted.data) return `${reverted.data.errorName}(${reverted.data.args?.join(", ")})`;
  return error instanceof BaseError ? error.shortMessage : String(error);
}

/**
 * Swissquote's Share B and the partner's Share C rebuild the wallet key for this one recovery
 * signature, then the key is dropped. The partner checks the recovery key's signature itself.
 */
export async function signRecovery(wallet: Wallet, hash: Hex, userOp: UserOperation<"0.7">, recoverySignature: Hex): Promise<Hex> {
  const { signer } = await liveCredentials(wallet);
  const approval = await signTicket(swissquote(), chain.id, "RecoveryApproval", { wallet: wallet.address, userOpHash: hash });
  const res = await fetch(`${partnerUrl}/recovery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ approval, userOp: formatUserOperationRequest(userOp), signature: recoverySignature }),
  }).catch(() => {
    throw new HttpError(503, "The independent service is unreachable.");
  });
  const body = (await res.json()) as { share: Share } | { error: string };
  if ("error" in body) throw new HttpError(403, "The independent service refused the recovery.", { detail: body.error });
  const b = store().shares.get(signer);
  if (!b) throw new HttpError(500, "Swissquote holds no Share B for this wallet's key.");
  const key = privateKeyToAccount(combine(b.share, body.share));
  if (!isAddressEqual(key.address, signer)) throw new HttpError(500, "Shares B and C do not rebuild this wallet's key.");
  return key.sign({ hash });
}
