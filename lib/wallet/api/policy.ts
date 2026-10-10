// Swissquote's off-chain rules for every transaction it co-signs and sponsors. On-chain
// rules (IRule contracts on the account) bind even Swissquote; these add screening and
// step-up that need off-chain data.
import { decodeFunctionData, erc20Abi, formatEther, formatUnits, isAddressEqual, maxUint256, type Address } from 'viem'
import { accountAbi, type Call } from '../account.ts'
import { addresses, publicClient } from '../env.ts'
import { HttpError } from './clients.ts'

export type Tier = 'standard' | 'confirm' | 'high' | 'blocked'
export type Decision = { tier: Tier; summary: string[]; reasons: string[] }

const TIERS: Tier[] = ['standard', 'confirm', 'high', 'blocked']
const ETH_CHF = 2_000 // ponytail: mocked FX rate (1 USDC = 1 CHF too); production reads Swissquote's price feed
const SETTINGS = ['addRule', 'removeRule', 'setGuardian', 'setConfirmationKey', 'setRecoveryDelay']

export async function decide(wallet: Address, calls: Call[]): Promise<Decision> {
  let tier: Tier = 'standard'
  const summary: string[] = []
  const reasons: string[] = []
  const raise = (t: Tier, reason: string) => {
    if (TIERS.indexOf(t) > TIERS.indexOf(tier)) tier = t
    reasons.push(reason)
  }
  const recipients: Address[] = []
  let chf = 0

  for (const call of calls) {
    chf += Number(formatEther(call.value)) * ETH_CHF
    if (isAddressEqual(call.to, wallet)) {
      const fn = tryDecode(accountAbi, call)?.functionName
      if (fn === 'cancelRecovery') summary.push('You cancel the pending recovery of your wallet.')
      else if (fn && SETTINGS.includes(fn)) {
        raise('high', 'changes a wallet security setting')
        summary.push(`You change a security setting of your wallet (${fn}).`)
      } else raise('blocked', `${fn ?? 'this call'} on the wallet itself is not allowed from the app`)
    } else if (isAddressEqual(call.to, addresses.usdc)) {
      const decoded = tryDecode(erc20Abi, call)
      if (decoded?.functionName === 'transfer') {
        const [to, amount] = decoded.args
        recipients.push(to)
        chf += Number(formatUnits(amount, 6))
        summary.push(`You send ${formatUnits(amount, 6)} USDC to ${to}.`)
      } else if (decoded?.functionName === 'approve') {
        const [spender, amount] = decoded.args
        if (amount === maxUint256) raise('blocked', 'unlimited approvals are not allowed, approve the exact amount')
        raise('blocked', `${spender} is not an approved spender`) // no approved dApps on testnet yet
      } else raise('blocked', 'only USDC transfers are allowed')
    } else if (isAddressEqual(call.to, addresses.spendingLimitRule)) {
      summary.push('You change your daily spending limit. Raising it takes effect after 24 hours.')
    } else if (call.data === '0x' && !(await publicClient.getCode({ address: call.to }))) {
      recipients.push(call.to)
      summary.push(`You send ${formatEther(call.value)} ETH to ${call.to}.`)
    } else {
      raise('blocked', `contract ${call.to} is not on Swissquote's approved list`)
    }
  }

  for (const address of await sanctioned(recipients)) raise('blocked', `${address} is on a sanctions list`)
  if (chf > 10_000) raise('high', 'above CHF 10,000')
  else if (chf > 1_000) raise('confirm', 'above CHF 1,000')

  summary.push('Network fee: paid by Swissquote.')
  if ((tier as Tier) !== 'blocked') summary.push('Checks passed: recipients not on sanctions lists, contracts on the approved list.')
  return { tier, summary, reasons }
}

function tryDecode<const abi extends typeof accountAbi | typeof erc20Abi>(abi: abi, call: Call) {
  try {
    return decodeFunctionData({ abi, data: call.data })
  } catch {
    return undefined
  }
}

/** TRM Labs public sanctions API. Fails closed: no screening, no co-signature. */
async function sanctioned(addresses: Address[]): Promise<Address[]> {
  if (!addresses.length) return []
  const res = await fetch('https://api.trmlabs.com/public/v1/sanctions/screening', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(addresses.map((address) => ({ address }))),
  })
  if (!res.ok) throw new HttpError(503, 'sanctions screening is unavailable, try again later')
  const rows = (await res.json()) as { address: Address; isSanctioned: boolean }[]
  return rows.filter((r) => r.isSanctioned).map((r) => r.address)
}
