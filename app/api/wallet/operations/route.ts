import { encodeFunctionData, type Address, type Hex } from 'viem'
import { accountAbi, stubRecoverySignature, stubSignature, type Call, type Passkey } from '@/lib/wallet/account.ts'
import { HttpError, requireClient, route } from '@/lib/wallet/api/clients.ts'
import { audit, db } from '@/lib/wallet/api/db.ts'
import { prepare, requireIdentityCheck, requireShare, requireWallet } from '@/lib/wallet/api/operations.ts'
import { decide } from '@/lib/wallet/api/policy.ts'
import { publicClient, signerUrls } from '@/lib/wallet/env.ts'

const MONTHLY_SPONSORED_OPS = 30

type Body =
  | { calls: { to: Address; value?: string; data?: Hex }[]; stepUp?: { pin?: string; selfie?: string } }
  | { recovery: { signer: Address; passkey: Passkey } }

/**
 * Prepares a sponsored UserOperation. Normal operations go through Swissquote's policy;
 * the phone then signs the returned hash with its passkey and, with Swissquote, the MPC key.
 * Recovery operations start a recovery to the key made in the recovery ceremony.
 */
export const POST = route(async (request: Request) => {
  const client = await requireClient()
  const wallet = requireWallet(client.id)
  const body = (await request.json()) as Body

  if ('recovery' in body) {
    const { signer, passkey } = body.recovery
    requireIdentityCheck(client)
    if (!(await publicClient.getCode({ address: wallet.address }))) {
      throw new HttpError(409, 'this wallet was never used on-chain, create a new one instead')
    }
    await requireShare(client, signer, passkey) // issued only after the identity check
    const callData = encodeFunctionData({ abi: accountAbi, functionName: 'initiateRecovery', args: [signer, passkey] })
    const prepared = await prepare(client, wallet, 'recovery', callData, stubRecoverySignature)
    audit(client.id, 'recovery.prepared', { hash: prepared.hash, signer })
    return Response.json(prepared)
  }

  const calls: Call[] = body.calls.map((c) => ({ to: c.to, value: BigInt(c.value ?? 0), data: c.data ?? '0x' }))
  if (!calls.length) throw new HttpError(400, 'no calls')

  const decision = await decide(wallet.address, calls)
  if (decision.tier === 'blocked') {
    audit(client.id, 'operation.blocked', { calls, decision })
    throw new HttpError(403, "We can't co-sign this transaction", { decision })
  }
  const pinOk = body.stepUp?.pin === client.pin // MOCKED Swissquote PIN
  const selfieOk = body.stepUp?.selfie === client.kycFace // MOCKED liveness match against KYC photo
  if ((decision.tier === 'confirm' && !pinOk) || (decision.tier === 'high' && !(pinOk && selfieOk))) {
    throw new HttpError(403, 'confirmation required', { decision, stepUp: decision.tier === 'high' ? ['pin', 'selfie'] : ['pin'] })
  }

  const month = new Date().toISOString().slice(0, 7)
  const used = db().prepare('select count from sponsorships where client_id = ? and month = ?').get(client.id, month) as
    | { count: number }
    | undefined
  if ((used?.count ?? 0) >= MONTHLY_SPONSORED_OPS) throw new HttpError(429, 'monthly sponsored transactions used up')

  const callData =
    calls.length === 1
      ? encodeFunctionData({ abi: accountAbi, functionName: 'execute', args: [calls[0].to, calls[0].value, calls[0].data] })
      : encodeFunctionData({
          abi: accountAbi,
          functionName: 'executeBatch',
          args: [calls.map((c) => ({ target: c.to, value: c.value, data: c.data }))],
        })
  const prepared = await prepare(client, wallet, 'normal', callData, stubSignature)
  db().prepare(
    'insert into sponsorships values (?, ?, 1) on conflict (client_id, month) do update set count = count + 1',
  ).run(client.id, month)
  audit(client.id, 'operation.approved', { hash: prepared.hash, decision })
  return Response.json({ ...prepared, decision, signer: wallet.signer, cosigner: signerUrls.swissquote })
})
