# Wallet-independent dApp compliance

Implementation of the policy part of `PROPOSAL.md`, section 8. The service evaluates **Swissquote assistance**, not ownership of funds: refusing a decision must stop bank co-signing and gas sponsorship, not the user's independent exit.

This is a hackathon component, not a legal compliance certification. The existing wallet UI is unchanged. No Safe, MPC, wallet creation, passkey, paymaster or blockchain-broadcast implementation is included here.

## Run the demo

Requires Node.js 20.9+ and installed dependencies. From the repository root:

```powershell
npm ci
npm run test:compliance
npm run typecheck
npm run demo:compliance
```

The CLI uses deterministic sanctions, simulation and usage fixtures. It prints six cases, verifies authorizing receipt signatures and checks the audit hash chain:

| Case | Expected decision |
| --- | --- |
| 20 USDC transfer | ALLOW |
| 2,000 USDC transfer | STEP_UP |
| Finite approval followed by a 250 USDC vault deposit | ALLOW |
| Fixture sanctions match | DENY_ASSISTANCE |
| Unlisted contract | DENY_ASSISTANCE |
| Unlimited token approval | DENY_ASSISTANCE |

The vault at `0x4444444444444444444444444444444444444444` is **not a deployed contract**; its one-to-one conversion exists only in fixtures. Demo receipts contain `assurance: "DEMO"` and verification rejects them unless explicitly allowed for testing.

To exercise the actual Next.js API, set these variables in a terminal and start the app:

```powershell
$env:COMPLIANCE_MODE = 'demo'
$env:COMPLIANCE_API_KEY = 'local-demo-only-change-before-deployment'
npm run dev
```

In a second terminal, set the same API key and run:

```powershell
$env:COMPLIANCE_API_KEY = 'local-demo-only-change-before-deployment'
npm run demo:compliance -- --http
```

Alternatively use `.env.compliance.example` as the values for an ignored `.env.local`. The standalone CLI does not automatically load Next.js environment files. `COMPLIANCE_BASE_URL` changes its HTTP target. `node --import tsx tools/compliance-demo.ts --request vault-deposit` prints a request as JSON.

## Integration boundary

```text
Authenticated wallet backend -> raw EVM call intent -> ComplianceEngine
  -> registry + calldata + limits + sanctions + simulation
  -> signed, expiring decision + audit append
  -> wallet/paymaster independently verifies and enforces the decision
```

`lib/compliance` contains framework-independent TypeScript and injected provider interfaces. It does not import wallet or MPC SDKs. `services/compliance` contains Node.js signing, audit and provider adapters. `app/api/compliance` is a thin Next.js wrapper; another backend can use the same engine directly.

Supported intent adapters:

- ERC-20 `transfer` and finite `approve`, including permission revocation.
- ERC-4626 `deposit`, `withdraw`, `redeem`; the configured vault must declare registered underlying and share tokens. Deposits must return shares to the account; withdrawals must use its own shares.
- Explicitly configured native transfers, disabled in the demo policy.
- Ordered batches of up to 16 calls. Amounts and limits are integer strings in token base units, never floating-point or purported CHF equivalents.

Refused: unlisted contracts/functions/spenders, unknown or noncanonical calldata, unlimited approvals, NFT `setApprovalForAll`, delegatecalls, account administration and unsupported chains. Approvals are never silently rewritten: the wallet must build a new finite request and obtain fresh user approval.

An origin allowlist checks a **claimed** origin only. Omitting or forging that field cannot authorize an unlisted contract, but the field does not authenticate a website. The host must preserve authenticated dApp-session provenance. Swap routers, arbitrary multicalls, WalletConnect session management, `personal_sign`, EIP-712 permits and other off-chain messages are not supported by this component; do not route them around its checks.

## HTTP API

All three endpoints require:

```text
Authorization: Bearer <server-to-server COMPLIANCE_API_KEY>
X-Compliance-Subject: <subject resolved by the trusted bank backend>
```

Never expose the API key through `NEXT_PUBLIC_*` or ship it to a dApp/browser. The bank backend must authenticate the client, establish the account-to-client binding, overwrite caller-supplied identity headers and authorize the requested account. This module does not implement bank authentication or wallet ownership verification.

- `POST /api/compliance/evaluate`: JSON body, at most 128 KiB; returns a signed decision.
- `GET /api/compliance/keys`: public Ed25519 key, key ID and mode. No private key is returned.
- `GET /api/compliance/registry`: normalized policy, policy hash and mode.

Example transfer request (calldata is generated with viem, not manually encoded):

```ts
import { encodeFunctionData, erc20Abi } from "viem";

const intent = {
  requestId: "client-intent-001",
  chainId: 84532,
  account: "0x1111111111111111111111111111111111111111",
  nonce: "42", // wallet-specific nonce; must be independently checked by the host
  // operationHash: "0x...", // optional final wallet-envelope digest, 32 bytes
  calls: [{
    to: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    value: "0",
    operation: "CALL",
    data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [
      "0x2222222222222222222222222222222222222222", 20_000_000n,
    ] }),
  }],
};
```

Response shape:

```ts
{
  decision: {
    schemaVersion: "1", decisionId, requestId, requestHash,
    policyVersion, policyHash, subjectHash,
    status, riskLevel, reasons, summary, decodedActions,
    screening, simulation, usage, requiredActions,
    issuedAt, expiresAt, assurance, limitations,
  },
  proof: { algorithm: "Ed25519", keyId, signature }, // base64url detached signature
}
```

Policy outcomes are HTTP 200, including refusals. An HTTP success is **not** authorization. Malformed requests return 400, authentication failure 401, unsupported content type 415, oversized bodies 413, and missing configuration/audit/internal failures 503. All responses are `no-store`; outages never fall back to ALLOW.

| Decision | Host action |
| --- | --- |
| ALLOW | Verify the receipt and exact operation, reserve spending, obtain user approval, then assist |
| STEP_UP | Same checks, plus independently verify additional authentication bound to this intent |
| REVIEW | Do not sign or sponsor; retry or investigate and obtain a fresh authorizing decision |
| DENY_ASSISTANCE | Refuse Swissquote co-signing and sponsorship; independent self-custody is unaffected |

## Consume a decision safely

Server-side verification uses established Node.js Ed25519 cryptography, not a wallet signing key:

```ts
import { verifyDecision } from "./services/compliance/signing";

const authorized = verifyDecision(receipt, {
  publicKeyPem: configuredPinnedServicePublicKey,
  policyHash: configuredExpectedPolicyHash,
  request: independentlyRebuiltIntent,
  subject: authenticatedClientId,
  allowStepUp: extraAuthenticationVerifiedForThisExactIntent,
  // allowDemo: true only in a test/demo environment
});
if (!authorized) throw new Error("Do not co-sign or sponsor");
```

Pin the public key and policy hash through trusted deployment configuration. Do not trust a key delivered with an untrusted receipt. The keys endpoint helps controlled bootstrap, not automatic trust-on-every-request. Demo runtime keys are ephemeral unless configured; production keys must persist and rotate through an approved trust-anchor update.

The receipt binds normalized chain, account, ordered calldata/value/operation, nonce, optional operation hash, client subject and policy. Verification is stateless: it **does not prevent reuse** by itself. The host must atomically consume the decision ID/nonce once and reserve daily spending before signing, settle on inclusion, and safely release failed/expired reservations. Two parallel ALLOW decisions must not bypass the daily limit.

The engine simulates direct calls from the account. It does **not** simulate or authorize the complete Safe transaction/UserOperation, account deployment, modules, signatures, fee fields or paymaster data. The wallet adapter must decode the final envelope, prove it contains exactly the reviewed calls, independently recompute any `operationHash`, enforce the execution path and run its envelope-level checks. Supplying an opaque hash alone proves nothing about its contents. Any material change requires reevaluation and renewed user approval.

## Live adapters and configuration

Set `COMPLIANCE_MODE=live` and provide all four mandatory values:

- `COMPLIANCE_API_KEY`: strong, secret backend credential. Deploy behind HTTPS with gateway rate limiting, request timeouts and appropriate access controls.
- `COMPLIANCE_POLICY_FILE`: JSON file containing an explicitly reviewed policy; no implicit live registry.
- `COMPLIANCE_SIGNING_PRIVATE_KEY`: persistent Ed25519 PKCS#8 PEM from a secret manager (`\n` escapes supported). Keep separate from all wallet/paymaster/MPC keys. An HSM/KMS signer can replace the `DecisionSigner` adapter.
- `COMPLIANCE_RPC_URLS`: JSON map of numeric chain IDs to HTTPS RPC URLs, e.g. `{"84532":"https://sepolia.base.org"}`. Chain ID is verified before simulation.

Optional: `TRM_API_KEY`, `COMPLIANCE_AUDIT_FILE` (default `var/compliance/audit.ndjson`). Restart after configuration/key/policy changes; the server runtime is a process singleton.

Provision the policy file and a persistent writable audit location separately when deploying; operator-specified paths are intentionally excluded from Next.js automatic asset tracing. Do not deploy the file sink as an ephemeral/serverless audit store.

Minimal policy shape for USDC on Base Sepolia:

```json
{
  "version": "reviewed-testnet-policy-1",
  "decisionTtlSeconds": 120,
  "screeningMaxAgeSeconds": 120,
  "supportedChainIds": [84532],
  "nativeTransfers": [],
  "tokens": [{
    "chainId": 84532,
    "address": "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    "symbol": "USDC",
    "decimals": 6,
    "approvedSpenders": [],
    "maxTransactionAmount": "10000000000",
    "stepUpAmount": "1000000000",
    "dailyLimitAmount": "5000000000"
  }],
  "contracts": [{
    "chainId": 84532,
    "address": "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    "name": "USDC",
    "kind": "ERC20",
    "allowedFunctions": ["transfer", "approve"],
    "origins": []
  }]
}
```

Add only actually deployed, reviewed vaults and their origins/spenders. Address allowlisting does not establish code safety or constrain upgrades. Production needs contract due diligence, upgrade monitoring, trusted deployment/proxy verification and immediate policy updates when contracts change. These are not implemented here.

Live runtime intentionally uses `UnavailableUsageProvider`: operations subject to a daily cap return REVIEW until a trusted bank usage/reservation adapter is connected. Do not replace this with an always-zero counter or remove required caps to make the demo pass. Inject `UsageProvider` when constructing `ComplianceEngine`; its snapshot must include settled spending plus outstanding reservations for the authenticated subject, account, chain and agreed daily window.

`TrmScreeningProvider` calls the documented address sanctions endpoint. With an API key, authentication is Basic `key:key`; without one it attempts the documented public tier. Availability and quotas are provider-controlled. HTTP 401/429, malformed or missing results and timeouts become unavailable evidence. There is no stale cache or silent CLEAR fallback. The in-process request queue is not a distributed quota manager.

`ViemSimulationProvider` uses ordered, stateful `simulateCalls` with transfer and asset-change tracing via `eth_simulateV1`, from the actual account. It applies no fabricated balances or allowances. Unsupported RPCs return unavailable evidence; it does not downgrade to independent `eth_call` requests. Simulation validates net losses, gross recipients/amounts, approvals and vault outputs, but is predictive and limited to observed transfers/events. It is not a complete call trace or proof against malicious token behavior and state changes before inclusion.

Provider implementations are integration-tested with fake transports. A live read-only check on 2026-10-10 also returned a TRM sanctions MATCH for the proposal's demonstration address and confirmed a zero-allowance USDC approval simulation on Base Sepolia. No transaction was signed or broadcast. Reproduce this optional network check with `npm run check:compliance-providers`; it consumes TRM quota, uses `TRM_API_KEY` if configured and accepts `COMPLIANCE_CHECK_RPC_URL` to override the default Base Sepolia RPC. It is not part of the deterministic test suite.

This component has not established a sanctions-list coverage contract or broadcast a transaction; the wallet team's real testnet transaction remains required. `LIVE_PROVIDERS` identifies adapter mode, not regulatory certification.

## Audit and regulatory scope

Decisions are signed using Node.js cryptography and appended to a serialized SHA-256 hash-chain NDJSON log. A failed append prevents returning an authorizing receipt. The file sink restores and checks its chain on restart, but is **single-process only**; do not share it across workers or serverless instances. Use transactional shared storage in production.

Without externally anchored checkpoints, a local hash chain cannot prove completeness, detect suffix truncation or prevent an operator rewriting history. Production additionally needs immutable storage, durable commits, access controls, incident handling, approved retention/deletion rules and privacy/data-residency review. Audit records contain account/recipient addresses and transaction details; a hashed subject is pseudonymous, not anonymous.

TRM's endpoint is not a blanket claim of SECO/OFAC/EU/UN coverage, transaction monitoring/KYT or Travel Rule clearance. Production must explicitly contract and verify required list coverage and update frequency, integrate identity/ownership evidence where required, handle false positives/escalations and obtain Swiss legal/compliance review. This component supplies technical assistance controls, not conclusions about custody classification, AMLA obligations or automatic ownership proof at creation.

## Files and extension points

- `lib/compliance/{types,schema,canonical,decode,engine}.ts`: request/policy contract, strict validation, normalized hashing, reviewed decoding, policy evaluation.
- `services/compliance/{demo,trm,viem-simulation}.ts`: provider implementations; replace through the `ScreeningProvider`, `SimulationProvider` and `UsageProvider` interfaces.
- `services/compliance/{signing,audit,runtime,http}.ts`: receipt signing/verification, audit, configuration and authenticated HTTP wrapper.
- `app/api/compliance/{evaluate,keys,registry}/route.ts`: thin Node.js Next.js routes.
- `tests/compliance`: engine, tampering, provider, HTTP and audit tests.
- `tools/compliance-demo.ts`: six demo cases and HTTP runner.
- `tools/compliance-provider-check.ts`: opt-in live read-only sanctions/RPC diagnostics.

Dependencies added: viem (ABI encoding/decoding, hashing and RPC), zod (strict schemas), tsx (test/demo runner). Receipt signing uses built-in Node.js crypto. No custom MPC or cryptographic primitive implementation.

Dependency audit during implementation reported seven high-severity entries in the existing shadcn/glob dependency tree (braces/micromatch/fast-glob and downstream consumers). No automatic or breaking dependency fix was applied; resolve and reassess these before deployment. The compliance additions were not named in that audit report.

## Primary documentation

- [TRM sanctions introduction](https://docs.trmlabs.com/guides/sanctions/introduction) and [screening endpoint](https://docs.trmlabs.com/api/sanctions/screening/submit-one-or-more-addresses-to-be-screened).
- [viem simulateCalls](https://viem.sh/docs/actions/public/simulateCalls) and [implementation](https://github.com/wevm/viem/blob/main/src/actions/public/simulateCalls.ts).
- [ERC-20](https://eips.ethereum.org/EIPS/eip-20), [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626), [ERC-4337](https://eips.ethereum.org/EIPS/eip-4337).
- [Node.js crypto](https://nodejs.org/api/crypto.html), [Zod documentation](https://zod.dev/).
