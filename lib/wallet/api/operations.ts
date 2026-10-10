// Builds, sponsors and submits UserOperations for clients' SwissquoteAccounts.
import { randomUUID } from 'node:crypto'
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
import { addresses, bundlerUrl, chain, entryPoint, publicClient, rpcUrl, signerUrls } from '../env.ts'
import { PARTNER, remoteParty, run, SIGN_STEPS, SWISSQUOTE, toEthSignature } from '../mpc.ts'
import { signTicket } from '../tickets.ts'
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

export type WalletConfig = {
  signer: Address
  passkey: Passkey
  confirmationKey: Address
  guardian: Address
  recoveryDelay: number
  rules: Address[]
}
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

const IDENTITY_CHECK_TTL = 15 * 60_000

/** Recovery steps need a recent pass of the (mocked) ID and liveness check. */
export function requireIdentityCheck(client: Client) {
  const check = db().prepare('select passed_at from identity_checks where client_id = ?').get(client.id) as
    | { passed_at: number }
    | undefined
  if (!check || Date.now() - check.passed_at > IDENTITY_CHECK_TTL) throw new HttpError(403, 'pass the identity check first')
}

export function walletConfig(signer: Address, passkey: Passkey, confirmationKey: Address): WalletConfig {
  return {
    signer,
    passkey,
    confirmationKey,
    guardian: swissquote().address,
    recoveryDelay: Number(process.env.RECOVERY_DELAY ?? 48 * 3600),
    rules: [addresses.spendingLimitRule],
  }
}

export const predictAddress = (config: WalletConfig) =>
  publicClient.readContract({ address: addresses.factory, abi: factoryAbi, functionName: 'getAddress', args: [config, 0n] })

/** The co-signer holds a share for this key, made in a ceremony this client was ticketed for. */
export async function requireShare(client: Client, signer: Address, passkey: Passkey) {
  const res = await fetch(`${signerUrls.swissquote}/shares/${signer}`)
  const share = res.ok ? ((await res.json()) as { clientId: string; passkey: Passkey }) : undefined
  if (share?.clientId !== client.id || share.passkey.x !== passkey.x || share.passkey.y !== passkey.y) {
    throw new HttpError(403, 'this key did not come from your key ceremony with Swissquote')
  }
}

// ---------------------------------------------------------------- operations

export type Kind = 'normal' | 'recovery'

/** Estimates gas, signs Swissquote's sponsorship and stores the operation for submission. */
export async function prepare(client: Client, wallet: Wallet, kind: Kind, callData: Hex, stubSignature: Hex) {
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
  db().prepare('insert into operations values (?, ?, ?, ?, ?)').run(hash, client.id, kind, json(rpc), Date.now())
  return { hash, userOp: rpc }
}

/** paymasterData for eth-infinitism's VerifyingPaymaster: abi.encode(validUntil, validAfter) ++ signature. */
async function sponsorship(validUntil: bigint, signature: Hex) {
  const window = encodeAbiParameters([{ type: 'uint48' }, { type: 'uint48' }], [Number(validUntil), 0])
  // The stub must still be a recoverable signature: the paymaster uses ECDSA.recover, which reverts otherwise.
  return concat([window, signature === '0x' ? await swissquote().signMessage({ message: 'estimation stub' }) : signature])
}

export function loadOperation(client: Client, hash: Hex) {
  const row = db().prepare('select * from operations where hash = ? and client_id = ?').get(hash, client.id) as
    | { kind: Kind; user_op: string }
    | undefined
  if (!row) throw new HttpError(404, 'unknown operation')
  return { kind: row.kind, userOp: formatUserOperation(JSON.parse(row.user_op)) as UserOperation<'0.7'> }
}

export async function submit(userOp: UserOperation<'0.7'>, signature: Hex) {
  return bundler
    .sendUserOperation({ ...userOp, signature, entryPointAddress: entryPoint } as never)
    .catch((error: Error) => {
      throw new HttpError(422, 'the bundler rejected the operation', { detail: error.message.split('\n')[0] })
    })
}

/** Swissquote (Share B) and the partner (Share C) sign a recovery the client confirmed with their home key. */
export async function signRecovery(wallet: Wallet, hash: Hex, userOp: UserOperation<'0.7'>, confirmationSignature: Hex) {
  const approval = await signTicket(swissquote(), chain.id, 'RecoveryApproval', {
    wallet: wallet.address,
    userOpHash: hash,
    expiry: Math.floor(Date.now() / 1000) + 300,
  })
  const request = { kind: 'recovery', signer: wallet.signer, userOp: formatUserOperationRequest(userOp), confirmationSignature, approval }
  const session = randomUUID()
  const [result] = await run(
    [
      remoteParty(SWISSQUOTE, `${signerUrls.swissquote}/sign/${session}`, { request }),
      remoteParty(PARTNER, `${signerUrls.partner}/sign/${session}`, { request }),
    ],
    SIGN_STEPS,
  ).catch((error: Error) => {
    throw new HttpError(403, 'the signers refused the recovery', { detail: error.message })
  })
  return toEthSignature(result.signature!, hash, wallet.signer)
}
