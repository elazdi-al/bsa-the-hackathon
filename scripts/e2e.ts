// End-to-end run of the wallet backend over HTTP, with the phone simulated in Node:
// create a wallet, send gasless, get refused, lose the phone, beat an attacker, recover
// (with a Swissquote cancel along the way) and send again with the new phone.
// Needs the Wallet API, both signers, a chain and a bundler running (see WALLET.md).
// On a local anvil fork it funds the wallet and fast-forwards the recovery delay itself.
import * as dkls from '@silencelaboratories/dkls-wasm-ll-node'
import { P256, WebAuthnP256 } from 'ox'
import {
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  keccak256,
  numberToHex,
  parseUnits,
  type Address,
  type Hex,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { runKeyCeremony, signOperation, type PasskeySigner, type Prepared } from '../lib/wallet/client.ts'
import { addresses, publicClient } from '../lib/wallet/env.ts'

const API = process.env.API_URL ?? 'http://localhost:3000'
const ANNA = privateKeyToAccount(generatePrivateKey()).address
const SANCTIONED: Address = '0x098B716B8Aaf21512996dC57EB0615e2383E2f96' // flagged by TRM

/** A browser session with its cookie jar. */
function session() {
  let cookie = ''
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(API + path, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    cookie = res.headers.get('set-cookie')?.split(';')[0] ?? cookie
    return { status: res.status, data: await res.json() }
  }
}
type Api = ReturnType<typeof session>

async function ok(call: Promise<{ status: number; data: any }>) {
  const { status, data } = await call
  if (status !== 200) throw new Error(`${status}: ${JSON.stringify(data)}`)
  return data
}

async function refused(call: Promise<{ status: number; data: any }>, status: number) {
  const res = await call
  if (res.status !== status) throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.data)}`)
  return res.data
}

/** A phone's passkey, in software. The browser uses WebAuthnP256.sign (Face ID) instead. */
function phonePasskey() {
  const privateKey = P256.randomPrivateKey()
  const { x, y } = P256.getPublicKey({ privateKey })
  const sign: PasskeySigner = async (challenge) => {
    const { metadata, payload } = WebAuthnP256.getSignPayload({ challenge, origin: API, rpId: new URL(API).hostname })
    return { metadata, signature: P256.sign({ payload, privateKey, hash: true }) }
  }
  return { passkey: { x: numberToHex(x, { size: 32 }), y: numberToHex(y, { size: 32 }) }, sign }
}

const transfer = (to: Address, usdc: string) => ({
  to: addresses.usdc,
  data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, parseUnits(usdc, 6)] }),
})

async function waitFor(api: Api, hash: Hex) {
  for (;;) {
    const receipt = await ok(api('GET', `/api/wallet/operations/${hash}`))
    if (receipt.status === 'completed') return receipt.transactionHash as Hex
    if (receipt.status === 'failed') throw new Error(`operation reverted: ${receipt.reason}`)
    await new Promise((r) => setTimeout(r, 1000))
  }
}

async function send(api: Api, sign: PasskeySigner, share: Uint8Array, to: Address, usdc: string) {
  const prepared = (await ok(api('POST', '/api/wallet/operations', { calls: [transfer(to, usdc)] }))) as Prepared & {
    decision: { summary: string[] }
  }
  console.log(`  ${prepared.decision.summary.join('\n  ')}`)
  const signature = await signOperation(dkls, share, prepared, sign)
  await ok(api('POST', `/api/wallet/operations/${prepared.hash}`, { signature }))
  console.log(`  done: ${await waitFor(api, prepared.hash)}`)
}

async function startRecovery(api: Api, signer: Address, passkey: { x: Hex; y: Hex }, recoveryKit: ReturnType<typeof privateKeyToAccount>) {
  await ok(api('POST', '/api/recovery', { document: 'id-card-scan', selfie: 'claire' }))
  const { hash } = await ok(api('POST', '/api/wallet/operations', { recovery: { signer, passkey } }))
  const confirmationSignature = await recoveryKit.sign({ hash }) // the confirmation key from home
  await ok(api('POST', `/api/wallet/operations/${hash}`, { confirmationSignature }))
  console.log(`  recovery started: ${await waitFor(api, hash)}`)
}

const isAnvil = await publicClient.request({ method: 'anvil_nodeInfo' } as never).then(() => true, () => false)
const usdcBalance = (address: Address) =>
  publicClient.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [address] })

// ---------------------------------------------------------------- create

const claire = session()
await ok(claire('POST', '/api/session', { email: 'claire@example.com', password: 'claire' }))

console.log('1. Key ceremony: phone (A), Swissquote (B), partner (C)')
const phone1 = phonePasskey()
const key1 = await runKeyCeremony(dkls, await ok(claire('POST', '/api/wallet/ceremony', { passkey: phone1.passkey, purpose: 'create' })))
const recoveryKit = privateKeyToAccount(generatePrivateKey())
const wallet = await ok(claire('POST', '/api/wallet', { signer: key1.signer, passkey: phone1.passkey, confirmationKey: recoveryKit.address }))
console.log(`  wallet ${wallet.address}, MPC key ${key1.signer}`)

if (isAnvil) {
  // Circle's FiatToken keeps balances in slot 9.
  const slot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [wallet.address, 9n]))
  await publicClient.request({
    method: 'anvil_setStorageAt',
    params: [addresses.usdc, slot, numberToHex(parseUnits('100', 6), { size: 32 })],
  } as never)
} else {
  console.log(`  waiting for 25 testnet USDC at ${wallet.address} (https://faucet.circle.com)`)
  while ((await usdcBalance(wallet.address)) < parseUnits('25', 6)) await new Promise((r) => setTimeout(r, 5000))
}

console.log('2. Send 20 USDC: deploys the account, Swissquote pays the gas')
await send(claire, phone1.sign, key1.share, ANNA, '20')

console.log('3. Policy refuses a sanctioned recipient and asks for step-up above CHF 1,000')
console.log(`  ${(await refused(claire('POST', '/api/wallet/operations', { calls: [transfer(SANCTIONED, '1')] }), 403)).decision.reasons}`)
console.log(`  ${(await refused(claire('POST', '/api/wallet/operations', { calls: [transfer(ANNA, '2000')] }), 403)).stepUp}`)

// ---------------------------------------------------------------- lose the phone

console.log('4. Attacker with the email and password fails the liveness check')
const attacker = session()
await ok(attacker('POST', '/api/session', { email: 'claire@example.com', password: 'claire' }))
console.log(`  ${(await refused(attacker('POST', '/api/recovery', { selfie: 'attacker' }), 403)).error}`)

console.log('5. Claire, new phone: ID check, new key ceremony, recovery signed by B + C + her home key')
const phone2 = phonePasskey()
await ok(claire('POST', '/api/recovery', { document: 'id-card-scan', selfie: 'claire' }))
const key2 = await runKeyCeremony(dkls, await ok(claire('POST', '/api/wallet/ceremony', { passkey: phone2.passkey, purpose: 'recovery' })))
await startRecovery(claire, key2.signer, phone2.passkey, recoveryKit)

console.log('6. Swissquote cancels it for her (e-banking), then she starts again')
await ok(claire('DELETE', '/api/recovery'))
if ((await ok(claire('GET', '/api/recovery'))).pending) throw new Error('recovery still pending')
await startRecovery(claire, key2.signer, phone2.passkey, recoveryKit)

const { executeAfter } = await ok(claire('GET', '/api/recovery'))
console.log(`7. Waiting out the recovery delay (until ${new Date(executeAfter * 1000).toISOString()})`)
const wait = executeAfter - Number((await publicClient.getBlock()).timestamp) + 1
if (isAnvil) {
  await publicClient.request({ method: 'evm_increaseTime', params: [numberToHex(wait)] } as never)
  await publicClient.request({ method: 'evm_mine', params: [] } as never)
} else {
  await new Promise((r) => setTimeout(r, wait * 1000))
}
const finalized = await ok(claire('PATCH', '/api/recovery'))
console.log(`  finalized, wallet key is now ${finalized.signer}`)

console.log('8. New phone sends 5 USDC: same address, same balance')
await send(claire, phone2.sign, key2.share, ANNA, '5')
console.log(`  Anna has ${formatUnits(await usdcBalance(ANNA), 6)} USDC, wallet ${formatUnits(await usdcBalance(wallet.address), 6)} USDC`)
console.log('All good.')
