// Builds, sponsors and submits UserOperations for users' SwissquoteAccounts.
import {
  concat,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  type Address,
  type Hex,
} from 'viem'
import {
  createBundlerClient,
  entryPoint07Abi,
  formatUserOperation,
  formatUserOperationRequest,
  getUserOperationHash,
  toPackedUserOperation,
  type UserOperation,
} from 'viem/account-abstraction'
import { privateKeyToAccount } from 'viem/accounts'
import { factoryAbi, paymasterAbi, type Passkey } from '../account.ts'
import { addresses, bundlerUrl, chain, entryPoint, publicClient, rpcUrl, services } from '../env.ts'
import { HttpError, type Client } from './clients.ts'
import { db, json } from './db.ts'

// ponytail: one key for paymaster signing, tickets and the guardian role; split them into an HSM in production.
// Read lazily so builds without secrets work.
export const swissquote = () => privateKeyToAccount(process.env.SWISSQUOTE_KEY as Hex)
export const operator = () => createWalletClient({ account: swissquote(), chain, transport: http(rpcUrl) })
export const bundler = createBundlerClient({ chain, transport: http(bundlerUrl) })

const SPONSORSHIP_TTL = 120n
// Gas estimation runs with a stub signature, so the account rejects it before the WebAuthn
// check (base64, sha256, P-256). This covers that part, including the no-precompile fallback.
const WEBAUTHN_VERIFICATION_GAS = 300_000n
const MAX_GAS_PER_OP = 2_000_000n

// ---------------------------------------------------------------- wallet registry

export type WalletConfig = { signer: Address; passkey: Passkey; confirmationKey: Address; guardian: Address }
export type Wallet = { address: Address; signer: Address; config: WalletConfig }

export function getWallet(clientId: string): Wallet | undefined {
  const row = db().prepare('select * from wallets where client_id = ?').get(clientId) as
    | { address: Address; signer: Address; config: string }
    | undefined
  return row && { address: row.address, signer: row.signer, config: JSON.parse(row.config) }
}

export function requireWallet(clientId: string): Wallet {
  const wallet = getWallet(clientId)
  if (!wallet) throw new HttpError(404, 'no wallet yet')
  return wallet
}

export const walletConfig = (signer: Address, passkey: Passkey, confirmationKey: Address): WalletConfig => ({
  signer,
  passkey,
  confirmationKey,
  guardian: swissquote().address,
})

export const predictAddress = (config: WalletConfig) =>
  publicClient.readContract({ address: addresses.factory, abi: factoryAbi, functionName: 'getAddress', args: [config, 0n] })

/** Swissquote holds Share B of this key, handed over under this client's ticket for this passkey. */
export async function requireShare(client: Client, signer: Address, passkey: Passkey) {
  const res = await fetch(`${services.swissquote}/shares/${signer}`)
  const share = res.ok ? ((await res.json()) as { clientId: string; passkey: Passkey }) : undefined
  if (share?.clientId !== client.id || share.passkey.x !== passkey.x || share.passkey.y !== passkey.y) {
    throw new HttpError(403, 'Swissquote holds no share of this key for you')
  }
}

// ---------------------------------------------------------------- operations

/**
 * Accounts deploy with their first transaction. Recovery needs the account on-chain (the share
 * services read its key and recovery key there), so Swissquote deploys an unused one first.
 */
export async function ensureDeployed(wallet: Wallet) {
  if (await publicClient.getCode({ address: wallet.address })) return
  const hash = await operator().writeContract({
    address: addresses.factory,
    abi: factoryAbi,
    functionName: 'createAccount',
    args: [wallet.config, 0n],
  })
  await publicClient.waitForTransactionReceipt({ hash })
}

/** Estimates gas, signs Swissquote's sponsorship (it pays the gas) and stores the operation for submission. */
export async function prepare(client: Client, wallet: Wallet, callData: Hex, stubSignature: Hex) {
  const [code, nonce, gasPrice, block] = await Promise.all([
    publicClient.getCode({ address: wallet.address }),
    publicClient.readContract({ address: entryPoint, abi: entryPoint07Abi, functionName: 'getNonce', args: [wallet.address, 0n] }),
    bundler.request({ method: 'pimlico_getUserOperationGasPrice' } as never) as Promise<{ fast: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex } }>,
    publicClient.getBlock(),
  ])
  const draft = {
    sender: wallet.address,
    nonce,
    callData,
    ...(code
      ? {}
      : {
          factory: addresses.factory,
          factoryData: encodeFunctionData({ abi: factoryAbi, functionName: 'createAccount', args: [wallet.config, 0n] }),
        }),
    maxFeePerGas: BigInt(gasPrice.fast.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(gasPrice.fast.maxPriorityFeePerGas),
    paymaster: addresses.paymaster,
    paymasterData: await sponsorship(0n, '0x'), // stub, replaced below
    signature: stubSignature,
  }

  const gas = await bundler
    .estimateUserOperationGas({ ...draft, entryPointAddress: entryPoint } as never)
    .catch((error: Error) => {
      throw new HttpError(422, 'this transaction would fail', { detail: error.message.split('\n')[0] })
    })
  const userOp = {
    ...draft,
    ...gas,
    verificationGasLimit: gas.verificationGasLimit + WEBAUTHN_VERIFICATION_GAS,
    paymasterPostOpGasLimit: gas.paymasterPostOpGasLimit ?? 0n,
  } as UserOperation<'0.7'>
  if (userOp.verificationGasLimit + userOp.callGasLimit > MAX_GAS_PER_OP) throw new HttpError(422, 'gas above the sponsorship cap')

  const validUntil = block.timestamp + SPONSORSHIP_TTL
  const sponsorHash = await publicClient.readContract({
    address: addresses.paymaster,
    abi: paymasterAbi,
    functionName: 'getHash',
    args: [toPackedUserOperation(userOp), Number(validUntil), 0],
  })
  userOp.paymasterData = await sponsorship(validUntil, await swissquote().signMessage({ message: { raw: sponsorHash } }))

  const hash = getUserOperationHash({ chainId: chain.id, entryPointAddress: entryPoint, entryPointVersion: '0.7', userOperation: userOp })
  const rpc = formatUserOperationRequest(userOp)
  db().prepare('insert into operations values (?, ?, ?)').run(hash, client.id, json(rpc))
  return { hash, userOp: rpc, signer: wallet.signer, services }
}

/** paymasterData for eth-infinitism's VerifyingPaymaster: abi.encode(validUntil, validAfter) ++ signature. */
async function sponsorship(validUntil: bigint, signature: Hex) {
  const window = encodeAbiParameters([{ type: 'uint48' }, { type: 'uint48' }], [Number(validUntil), 0])
  // The stub must still be a recoverable signature: the paymaster uses ECDSA.recover, which reverts otherwise.
  return concat([window, signature === '0x' ? await swissquote().signMessage({ message: 'estimation stub' }) : signature])
}

export function loadOperation(client: Client, hash: Hex) {
  const row = db().prepare('select user_op from operations where hash = ? and client_id = ?').get(hash, client.id) as
    | { user_op: string }
    | undefined
  if (!row) throw new HttpError(404, 'unknown operation')
  return formatUserOperation(JSON.parse(row.user_op)) as UserOperation<'0.7'>
}

export async function submit(userOp: UserOperation<'0.7'>, signature: Hex) {
  return bundler
    .sendUserOperation({ ...userOp, signature, entryPointAddress: entryPoint } as never)
    .catch((error: Error) => {
      throw new HttpError(422, 'the bundler rejected the operation', { detail: error.message.split('\n')[0] })
    })
}
