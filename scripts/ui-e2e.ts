// The wallet's UI flows in Google Chrome with a virtual passkey authenticator: create a wallet without
// signing in to Swissquote, send USDC (and a blocked recipient), then lose the phone and recover in a
// fresh browser with the Recovery Kit, cancel once, finish and send again. Same stack as e2e.ts, on a
// local anvil fork.
//   PRF=0 npm run e2e:ui                                  an authenticator without PRF
//   EMAIL=anna@example.com PASSWORD=anna npm run e2e:ui   as a Swissquote client: PIN step-up and ID check
import { chromium, type Page } from 'playwright'
import { encodeAbiParameters, erc20Abi, formatUnits, keccak256, numberToHex, parseUnits, type Address } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { addresses, publicClient } from '../lib/wallet/env.ts'

const APP = process.env.API_URL ?? 'http://localhost:3000'
const EMAIL = process.env.EMAIL
const PASSWORD = process.env.PASSWORD ?? ''
const PRF = process.env.PRF !== '0'
const FRIEND = privateKeyToAccount(generatePrivateKey()).address
const SANCTIONED: Address = '0x098B716B8Aaf21512996dC57EB0615e2383E2f96'
const SLOW = { timeout: 120_000 }

const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1' })

/** A phone: a fresh browser profile with its own platform authenticator. */
async function phone() {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 } })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      ctap2Version: 'ctap2_1',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf: PRF,
    },
  })
  page.on('pageerror', (error) => console.log(`  [page] ${error.message}`))
  return page
}

/** The optional Swissquote sign-in, when EMAIL is set. */
async function signIn(page: Page) {
  if (!EMAIL) return
  await page.goto(`${APP}/sign-in`)
  await page.getByPlaceholder('Email').fill(EMAIL)
  await page.getByPlaceholder('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname !== '/sign-in')
}

const usdc = (address: Address) =>
  publicClient.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [address] })

async function send(page: Page, to: Address, amount: string) {
  await page.goto(`${APP}/send-hide-my-wallet?to=${to}`)
  await page.getByLabel('Amount in USDC').fill(amount)
  await page.getByRole('button', { name: 'Continue' }).click()
  console.log(`  ${(await page.getByRole('list', { name: 'Summary' }).innerText(SLOW)).replaceAll('\n', '\n  ')}`)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.waitForURL('**/transaction-tracking?**', SLOW)
  await page.getByRole('button', { name: /Status.*Completed/ }).waitFor(SLOW)
  console.log(`  completed: ${new URL(page.url()).searchParams.get('hash')}`)
}

async function recover(page: Page, kit: string) {
  if (EMAIL) await page.getByRole('button', { name: 'Scan ID and take selfie' }).click()
  await page.locator('input[type=file]').setInputFiles(kit)
  await page.getByRole('button', { name: 'Restore with Face ID' }).click()
  await page.getByText('Your wallet will be restored on').waitFor(SLOW)
}

// ---------------------------------------------------------------- create

console.log(
  `1. ${EMAIL ? `Sign in as ${EMAIL}` : 'No sign-in'}, Device Key (passkey${PRF ? ' with PRF' : ', no PRF'}), Swissquote Key (ceremony), Recovery Kit`,
)
const phone1 = await phone()
await signIn(phone1)
await phone1.goto(`${APP}/onboarding-welcome`)
await phone1.getByRole('link', { name: 'Create wallet' }).click()
await phone1.getByRole('button', { name: 'Create Device Key' }).click()
await phone1.getByRole('button', { name: 'Create Swissquote Key' }).click(SLOW)
await phone1.getByLabel('Email').fill(EMAIL ?? 'me@example.com')
await phone1.getByRole('button', { name: 'Send code' }).click()
await phone1.getByLabel('6-digit code').fill('123456')
const download = phone1.waitForEvent('download', SLOW)
await phone1.getByRole('link', { name: 'Save Recovery Kit' }).click(SLOW)
const kit = await (await download).path()
await phone1.waitForURL('**/home')
const wallet = await phone1.evaluate(() => fetch('/api/wallet').then((r) => r.json()))
const { protection } = await phone1.evaluate(
  () =>
    new Promise<{ protection: string }>((resolve) => {
      indexedDB.open('swissquote-wallet').onsuccess = (e) => {
        const store = (e.target as IDBOpenDBRequest).result.transaction('shares').objectStore('shares')
        store.getAll().onsuccess = (r) => resolve({ protection: (r.target as IDBRequest).result[0].key ? 'device key' : 'passkey PRF' })
      }
    }),
)
console.log(`  wallet ${wallet.address}, Share A encrypted with ${protection}`)

// Circle's FiatToken keeps balances in slot 9.
const slot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [wallet.address, 9n]))
await publicClient.request({
  method: 'anvil_setStorageAt',
  params: [addresses.usdc, slot, numberToHex(parseUnits('5000', 6), { size: 32 })],
} as never)

console.log('2. Send 20 USDC: deploys the account, Swissquote pays the gas')
await send(phone1, FRIEND, '20')

console.log(`3. ${EMAIL ? 'PIN step-up' : 'No Swissquote PIN, so no step-up'} above CHF 1,000, and a sanctioned recipient is blocked`)
await phone1.goto(`${APP}/send-hide-my-wallet?to=${FRIEND}`)
await phone1.getByLabel('Amount in USDC').fill('2000')
await phone1.getByRole('button', { name: 'Continue' }).click()
if (EMAIL) {
  await phone1.getByText('This is a larger payment').waitFor(SLOW)
  await phone1.getByLabel('Swissquote PIN').fill('1234')
  await phone1.getByRole('button', { name: 'Continue' }).click()
}
await phone1.getByRole('list', { name: 'Summary' }).waitFor(SLOW)
console.log(`  ${EMAIL ? 'PIN accepted, ' : ''}summary shown for 2,000 USDC`)
await phone1.goto(`${APP}/send-hide-my-wallet?to=${SANCTIONED}`)
await phone1.getByRole('button', { name: 'Continue' }).click()
console.log(`  ${(await phone1.getByText("We can't co-sign this payment").locator('..').innerText(SLOW)).replaceAll('\n', ' ')}`)

// ---------------------------------------------------------------- lose the phone

const phone2 = await phone()
await signIn(phone2)
await phone2.goto(`${APP}/pending-verification`)
if (EMAIL) {
  console.log('4. New phone: an impostor fails the liveness check')
  await phone2.getByRole('button', { name: 'Simulate someone else' }).click()
  console.log(`  ${await phone2.getByText('Identity check failed').innerText(SLOW)}`)
} else {
  console.log('4. New phone: a made-up Recovery Kit is refused')
  const fake = Buffer.from(`Recovery key: ${generatePrivateKey()}`)
  await phone2.locator('input[type=file]').setInputFiles({ name: 'kit.txt', mimeType: 'text/plain', buffer: fake })
  await phone2.getByRole('button', { name: 'Restore with Face ID' }).click()
  console.log(`  ${await phone2.getByText("doesn't belong to any wallet").innerText(SLOW)}`)
}

console.log(`5. ${EMAIL ? 'ID check, ' : ''}Recovery Kit, new passkey and ceremony, then cancel it`)
await recover(phone2, kit)
await phone2.getByRole('button', { name: 'Cancel recovery' }).click()
await phone2.getByRole('button', { name: EMAIL ? 'Scan ID and take selfie' : 'Restore with Face ID' }).waitFor(SLOW)

console.log('6. Again, wait out the delay and finish')
await recover(phone2, kit)
console.log(`  ${await phone2.getByRole('heading').innerText()}`)
await phone2.getByRole('button', { name: 'Finish recovery' }).click({ timeout: 180_000 })
await phone2.getByText('Welcome back').waitFor(SLOW)

console.log('7. The new phone sends 5 USDC: same address, same balance')
await send(phone2, FRIEND, '5')
console.log(`  friend has ${formatUnits(await usdc(FRIEND), 6)} USDC, wallet ${formatUnits(await usdc(wallet.address), 6)} USDC`)

await browser.close()
console.log('All good.')
