// End-to-end run of the wallet backend over HTTP, with the phones simulated in Node:
// create a wallet (2-of-3 Shamir), send gasless, lose the phone, recover with Shares B + C and the
// recovery key (cancelled once from the old phone, once by Swissquote), wait out the 48-hour delay
// and send again with the new phone.
// Needs the Wallet API, both share services, a chain and a bundler running (see WALLET.md).
// On a local anvil fork it funds the wallet and fast-forwards the recovery delay itself.
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
import { accountAbi, kitProof } from '../lib/wallet/account.ts'
import {
  createKey,
  rebuildKey,
  releaseShareB,
  signNormal,
  signRecovery,
  type PasskeySigner,
  type Prepared,
} from '../lib/wallet/client.ts'
import { addresses, publicClient } from '../lib/wallet/env.ts'
import type { Share } from '../lib/wallet/shamir.ts'

const API = process.env.API_URL ?? 'http://localhost:3000'
const ANNA = privateKeyToAccount(generatePrivateKey()).address

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
type Phone = ReturnType<typeof phonePasskey> & { api: Api; share: Share; key?: Hex }

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

/** Passkey approves; the phone rebuilds the wallet key from Shares A + B unless it has it cached. */
async function operate(phone: Phone, call: { to: Address; data: Hex }) {
  const prepared = (await ok(phone.api('POST', '/api/wallet/operations', { call }))) as Prepared
  const assertion = await phone.sign(prepared.hash)
  if (!phone.key) {
    phone.key = rebuildKey(phone.share, await releaseShareB(prepared, assertion), prepared.signer)
    console.log('  wallet key rebuilt from Shares A + B, cached on the phone')
  } else console.log('  cached wallet key, no Shamir round')
  await ok(phone.api('POST', `/api/wallet/operations/${prepared.hash}`, { signature: await signNormal(prepared, phone.key, assertion) }))
  console.log(`  done: ${await waitFor(phone.api, prepared.hash)}`)
}

/** The new phone: new passkey, new wallet key split 2-of-3, initiateRecovery signed by Shares B + C and the recovery key. */
async function startRecovery(phone: Omit<Phone, 'share'>, recoveryKey: ReturnType<typeof privateKeyToAccount>) {
  const { share, signer } = await createKey(await ok(phone.api('POST', '/api/wallet/ceremony', { passkey: phone.passkey, purpose: 'recovery' })))
  const prepared = (await ok(phone.api('POST', '/api/wallet/operations', { recovery: { signer, passkey: phone.passkey } }))) as Prepared
  await ok(phone.api('POST', `/api/wallet/operations/${prepared.hash}`, { signature: await signRecovery(prepared, recoveryKey) }))
  console.log(`  recovery started: ${await waitFor(phone.api, prepared.hash)}`)
  return { share, signer }
}

const pending = async (api: Api) => (await ok(api('GET', '/api/recovery'))) as { pending: boolean; executeAfter: number }

const isAnvil = await publicClient.request({ method: 'anvil_nodeInfo' } as never).then(() => true, () => false)
const usdcBalance = (address: Address) =>
  publicClient.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [address] })

// ---------------------------------------------------------------- create

console.log('1. The phone splits a new wallet key 2-of-3: A stays, B to Swissquote, C to the independent service')
const phone1 = { ...phonePasskey(), api: session() }
const key1 = await createKey(await ok(phone1.api('POST', '/api/wallet/ceremony', { passkey: phone1.passkey, purpose: 'create' })))
const recoveryKey = privateKeyToAccount(generatePrivateKey())
const wallet = await ok(phone1.api('POST', '/api/wallet', { signer: key1.signer, passkey: phone1.passkey, confirmationKey: recoveryKey.address }))
const old: Phone = { ...phone1, share: key1.share }
console.log(`  wallet ${wallet.address}, wallet key ${key1.signer}`)

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

console.log('2. Send 10 USDC: deploys the account, Swissquote pays the gas')
await operate(old, transfer(ANNA, '10'))
console.log('   and 10 more with the cached key')
await operate(old, transfer(ANNA, '10'))

console.log('3. Swissquote refuses Share B without the passkey')
{
  const prepared = (await ok(old.api('POST', '/api/wallet/operations', { call: transfer(ANNA, '1') }))) as Prepared
  const refused = await releaseShareB(prepared, await phonePasskey().sign(prepared.hash)).then(() => false, (e: Error) => e.message)
  if (!refused) throw new Error('Share B was released to a stranger')
  console.log(`  ${refused}`)
}

// ---------------------------------------------------------------- lose the phone

console.log('4. New phone: the recovery key finds the wallet, then a recovery signed by Shares B + C and the recovery key')
const phone2 = { ...phonePasskey(), api: session() }
const at = Math.floor(Date.now() / 1000)
await ok(phone2.api('POST', '/api/recovery', { at, signature: await recoveryKey.signMessage({ message: kitProof(at) }) }))
await startRecovery(phone2, recoveryKey)

console.log('5. The old phone cancels it from the app (wallet key + passkey)')
await operate(old, { to: wallet.address, data: encodeFunctionData({ abi: accountAbi, functionName: 'cancelRecovery' }) })
if ((await pending(phone2.api)).pending) throw new Error('recovery still pending')

console.log('6. Started again, Swissquote cancels it for the user, then the user starts once more')
await startRecovery(phone2, recoveryKey)
await ok(phone2.api('DELETE', '/api/recovery'))
if ((await pending(phone2.api)).pending) throw new Error('recovery still pending')
const key2 = await startRecovery(phone2, recoveryKey)

const { executeAfter } = await pending(phone2.api)
console.log(`7. Waiting out the 48-hour recovery delay (until ${new Date(executeAfter * 1000).toISOString()})`)
const wait = executeAfter - Number((await publicClient.getBlock()).timestamp) + 1
if (isAnvil) {
  await publicClient.request({ method: 'evm_increaseTime', params: [numberToHex(wait)] } as never)
  await publicClient.request({ method: 'evm_mine', params: [] } as never)
} else {
  await new Promise((r) => setTimeout(r, wait * 1000))
}
const finalized = await ok(phone2.api('PATCH', '/api/recovery'))
console.log(`  finalized, wallet key is now ${finalized.signer}`)

console.log('8. New phone sends 5 USDC: same address, same balance')
await operate({ ...phone2, share: key2.share }, transfer(ANNA, '5'))
console.log(`  Anna has ${formatUnits(await usdcBalance(ANNA), 6)} USDC, wallet ${formatUnits(await usdcBalance(wallet.address), 6)} USDC`)
console.log('All good.')
