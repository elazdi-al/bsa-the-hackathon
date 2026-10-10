// Builds, sponsors and submits UserOperations. Swissquote submits them to the EntryPoint
// itself and pays the gas through its paymaster, so the client never needs ETH.
import { randomUUID } from "node:crypto";
import {
  BaseError,
  ContractFunctionRevertedError,
  concat,
  createWalletClient,
  decodeErrorResult,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
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
import { accountAbi, bindRecoveryKeyMessage, factoryAbi, paymasterAbi, type Config, type Passkey } from "../account.ts";
import { addresses, chain, credentials, isDeployed, partnerUrl, publicClient, rpcUrl } from "../env.ts";
import { poolAbi } from "../pool.ts";
import { address, passkey } from "../schema.ts";
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
// As long as a compliance decision lives, so a sponsored operation never outlives the decision behind it.
const SPONSORSHIP_TTL = 120n;

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
 * Swissquote assists only operations its compliance policy allows, every call of a batch included; refusing never
 * freezes the wallet itself. Of calls to the account itself, only a lone cancelRecovery passes.
 */
export async function assist(wallet: Wallet, callData: Hex) {
  const call = decodeFunctionData({ abi: accountAbi, data: callData });
  const calls =
    call.functionName === "execute" ? [{ target: call.args[0], value: call.args[1], data: call.args[2] }] : call.functionName === "executeBatch" ? call.args[0] : [];
  if (!calls.length) throw new HttpError(403, "The app can't make this call.");
  if (calls.some(({ target }) => isAddressEqual(target, wallet.address))) {
    const cancel = encodeFunctionData({ abi: accountAbi, functionName: "cancelRecovery" });
    if (call.functionName === "execute" && calls[0].data === cancel) return ["You cancel the pending recovery of your wallet."];
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
    },
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
    if (!event?.args.success) {
      // The account bubbles up the failing call's revert, like a swap's Slippage when the price moved.
      const [reverted] = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationRevertReason", logs: receipt.logs });
      throw new HttpError(422, "The operation reverted.", { transactionHash, detail: reverted && callError(reverted.args.revertReason) });
    }
    return transactionHash;
  });
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
  if (reverted instanceof ContractFunctionRevertedError && reverted.data) return `${reverted.data.errorName}(${reverted.data.args?.join(", ")})`;
  return error instanceof BaseError ? error.shortMessage : String(error);
}
