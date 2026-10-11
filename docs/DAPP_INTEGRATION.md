# Reviewed dApp integration

## What is implemented

Open **Apps → Reviewed dApps** (`/dapps`). The catalogue comes from the active compliance policy on the wallet's configured chain, not a frontend hard-coded list. The first adapter supports ERC-4626 deposits, withdrawals and permission revocation. This is a curated in-app interaction, not a generic dApp browser or WalletConnect session.

Fresh local deployments include `TestVault`, built on the project's pinned OpenZeppelin ERC-4626 implementation. It holds test USDC, has no yield strategy and promises no return. The original compliance demo's `0x444…` vault remains a fixture; the screen never presents an undeployed entry as executable.

## Wallet backend boundary

1. `GET /api/dapps` publishes public catalogue metadata. It checks the RPC chain, deployed vault, underlying asset and decimals against the policy. Only policy-listed actions are offered.
2. `GET /api/wallets/:address/dapps/:vault` reads balance, shares, asset value, allowance and vault limits at a common block.
3. `POST` to the same wallet/vault route with `{ action, amount }` returns a read-only preview. `amount` is an integer token-base-unit string. This is **not** compliance authorization.
4. The browser adapter independently constructs its requested call and invokes `phone.prepare(call, { origin, name })`. The existing `POST /api/wallets/:address/operations` decodes the actual account calldata and evaluates that exact call through the compliance engine. The server resolves chain and subject from the wallet, not from user-supplied dApp fields.
5. Only `ALLOW` gets an operation. It is paymaster-sponsored for a linked wallet, and an unlinked wallet pays its gas from its own ETH. The response includes the review and expiry; refusals include the full review plus the existing plain-text refusal format. Sponsorship is capped by both the decision's remaining time and the policy's `decisionTtlSeconds` (600 seconds in the local policy), using chain time for the paymaster and wall time for the review.
6. `phone.prepare` checks the returned operation and recomputes its signing hash, as before. After the user reviews it, `phone.approve` requests the passkey and signs through the existing wallet-key flow. The backend simulates the EntryPoint call, submits it and checks the UserOperation success event.

No `COMPLIANCE_API_KEY`, provider key or wallet key is sent to the dApp frontend. The authenticated `/api/compliance/*` endpoints remain backend-only. The compliance engine and browser-safe adapter contain no Shamir/MPC assumptions; only the phone adapter connects to the current wallet implementation.

## Two transactions, deliberately visible

The current account exposes one `execute` call, not a batch. A deposit with insufficient allowance therefore uses:

- Exact-amount `approve(vault, amount)`, with its own policy review and passkey approval.
- A fresh allowance/preview read, then a separately evaluated `deposit(amount, wallet)` and second passkey approval.

The deposit is never automatically signed after the approval. Both calls use fresh nonces, and both are sponsored for a linked wallet. An existing sufficient allowance skips the approval. Withdrawals fix both receiver and owner to the current wallet; the screen does not accept arbitrary recipient or delegatecall payloads.

Approval alone moves no assets, but it grants permission. If the user stops or the deposit fails, the screen shows the remaining on-chain allowance and offers `approve(vault, 0)` through **Revoke permission**. Revocation is itself checked and signed; it is not promised to bypass Swissquote refusal or provider outages. Plain ERC-4626 previews are indicative and provide no minimum-output protection.

## Visible decisions and failure handling

- `ALLOW`: review, decoded intent, evidence mode, risk label, simulation result, expected asset changes, decision/policy reference and expiry.
- `REVIEW`, `DENY_ASSISTANCE`: reasons, with no signing button. Existing case-management gaps are not replaced with a cosmetic confirmation.
- Expired approval: signing is disabled; a new check is required. Editing amount/action invalidates the old review.
- Missing wallet, wrong phone after recovery, unavailable backend, missing deployment or mismatched asset metadata: interaction is disabled or rejected.
- Confirmed calls: transaction hashes and refreshed on-chain balances/allowances. The screen's receipt list is session-local; existing wallet history also sees the USDC transfers, not a full dApp-labelled history. Home still reports cash USDC; vault position/value is shown on this screen rather than added to Home's portfolio chart.

## Run the demo

Install locked Node dependencies and Foundry. A **fresh** `npm run local` deploys the test vault and writes `local-dapps-1`, including finite USDC approvals and the vault's deposit/withdraw/redeem functions. Create a wallet, save its Recovery Key and fund it with `npm run fund`. Open `/dapps` from the Apps tab.

**Warning:** the existing default `npm run local` resets local `data/`. Use `npm run local -- --prod` to preserve an existing chain. This change does not silently expand a resumed policy or replace existing accounts.

On an older persisted chain, deploy **only** `contracts/script/DeployVault.s.sol`, supplying the existing `USDC_ADDRESS` and test-chain deployment credentials. Record its printed `VAULT_ADDRESS`, explicitly review/update the policy's asset/spender/origin/function entries and restart the app. `services/dapps/local-policy.ts` shows the local fixture policy shape. Do not rerun the full infrastructure deployment merely to add a vault.

Base Sepolia requires the corresponding deployed vault and a policy using chain ID 84532 and its actual addresses. The sample compliance fixture is not a ready-to-use public-testnet deployment.

## Verification

```sh
npm run test:compliance
npm run test:dapps
npm run check
npm run typecheck
npm run build
npm run contracts:test

# Against a running local stack:
npm run e2e:dapps
npm run e2e:dapps:ui

# Fresh isolated chain + temporary share vaults/policy, no reset of existing data:
npm run test:dapps:stack
npm run test:dapps:stack -- --ui
```

The isolated runner requires a production build and `forge`/`anvil` on PATH. For UI tests, install the Playwright headless browser (`npx playwright install chromium --only-shell`) or set `BROWSER_CHANNEL=msedge` for an installed Edge. The UI harness uses a virtual passkey, never an OS authentication dialog. Its test-only route redirect connects the build-pinned default partner URL to the isolated partner; if the build used another URL, supply `BUILD_PARTNER_URL` with that exact value.

Tests cover real local-chain calls, policy refusal, exact approval, withdrawals and partial-deposit revocation. `npm run e2e:dapps` links its wallet first, so its calls are sponsored and the wallet never holds ETH. `npm run e2e:dapps:ui` uses an unlinked wallet with ETH, which pays for its own calls. Browser checks also cover editing intent, an injected expired-review response, runtime errors and mobile overflow. Screenshots are written to ignored `shots/`.

## Production limitations

Demo sanctions/simulation evidence is explicitly labelled. Actual EntryPoint execution is simulated before submission, but that does not turn fixture evidence into live compliance coverage. Live mode still lacks the additional-verification workflow, Travel Rule exchange and institution-level authentication listed in [Known limits](SECURITY.md#known-limits). A registry entry and an on-chain metadata check are not a contract audit, regulatory approval or authenticated website identity. The fixed wallet gas limits are tested for this fixture, not arbitrary vault strategies.

This implementation does not change the custody model, recovery protocol or bank-independent-exit limitation. It implements the compliant-assistance UX on the current backend, not a claim that the wallet is production-ready or legally certified.
