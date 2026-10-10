// Chain and deployment config for server-side code (Wallet API, signer services, scripts).
import { createPublicClient, http, type Address } from 'viem'
import { entryPoint07Address } from 'viem/account-abstraction'
import { baseSepolia } from 'viem/chains'

export const chain = baseSepolia
export const entryPoint = entryPoint07Address
export const rpcUrl = process.env.RPC_URL ?? 'https://sepolia.base.org'
export const bundlerUrl = process.env.BUNDLER_URL ?? `https://public.pimlico.io/v2/${chain.id}/rpc`
export const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })

const required = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set, see .env.example`)
  return value as Address
}

export const addresses = {
  get factory() {
    return required('FACTORY_ADDRESS')
  },
  get paymaster() {
    return required('PAYMASTER_ADDRESS')
  },
  get spendingLimitRule() {
    return required('SPENDING_LIMIT_RULE_ADDRESS')
  },
  /** Address of Swissquote's API key: paymaster signer, ticket signer and recovery guardian. */
  get swissquote() {
    return required('SWISSQUOTE_ADDRESS')
  },
  usdc: (process.env.USDC_ADDRESS ?? '0x036CbD53842c5426634e7929541eC2318f3dCF7e') as Address,
}

export const signerUrls = {
  swissquote: process.env.SWISSQUOTE_SIGNER_URL ?? 'http://localhost:4001',
  partner: process.env.PARTNER_SIGNER_URL ?? 'http://localhost:4002',
}
