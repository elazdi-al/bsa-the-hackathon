# Wallet backend

ERC-4337 smart account on Base Sepolia, controlled by a 2-of-3 MPC key plus the client's passkey, with on-chain transaction rules, confirmation-key recovery behind a 48-hour delay, and gas paid by Swissquote's paymaster.

## Security model

| Flow | Signs | Verified on-chain by `SwissquoteAccount` |
| --- | --- | --- |
| Normal transaction | MPC key with Share A (phone) + Share B (Swissquote), and the phone's passkey | MPC ECDSA signature **and** WebAuthn assertion, both over the userOpHash |
| Recovery | MPC key with Share B + Share C (partner), and the confirmation key from home | MPC signature **and** confirmation-key signature; may only call `initiateRecovery` |
| Cancel recovery | Phone (normal transaction) or Swissquote as guardian | `cancelRecovery` |
| Finalize recovery | Anyone, after `recoveryDelay` | `finalizeRecovery` swaps in the new MPC key and passkey; address and funds unchanged |

Swissquote and the partner together produce MPC signatures, but without the passkey or the confirmation key the account rejects them.

Transaction rules are `IRule` contracts installed on the account (`addRule`/`removeRule`). The account calls each rule before every outgoing call. `SpendingLimitRule` is the example: a daily limit per token where raising the limit waits 24 hours. Swissquote's off-chain policy (`lib/wallet/api/policy.ts`) adds sanctions screening (TRM Labs), a contract allowlist and step-up tiers before it sponsors and co-signs.

## Layout

```
contracts/                 Foundry: SwissquoteAccount, factory, SpendingLimitRule, deploy script, tests
services/signer/server.ts  MPC co-signer, run twice: ROLE=swissquote (Share B), ROLE=partner (Share C)
app/api/                   Wallet API (Swissquote side)
lib/wallet/                Shared code; client.ts is the phone SDK (Share A)
scripts/e2e.ts             The whole flow over HTTP, phone simulated in Node
```

## Run it

```bash
cp .env.example .env.local   # fill in keys
cd contracts && forge soldeer install && forge test && cd ..
```

Deploy (prints the three addresses for `.env.local`):

```bash
cd contracts && forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $SWISSQUOTE_KEY --broadcast
```

Then run each of these in its own terminal:

```bash
npm run signer:swissquote
```

```bash
npm run signer:partner
```

```bash
npm run dev
```

```bash
npm run e2e
```

`npm run e2e:ui` runs the same flows through the screens in Google Chrome, with a virtual passkey authenticator (`PRF=0` for one without PRF, `EMAIL`/`PASSWORD` for the other demo client). Each demo client can create one wallet: to start over, delete `data/` and restart the signers and `next dev`.

On Base Sepolia, `npm run e2e` prints the new wallet's address and waits until you send it 25 USDC from the Circle faucet. Delete `data/` before running it again. To run fully offline, point `RPC_URL` at `anvil --fork-url https://sepolia.base.org --hardfork osaka --block-time 1` and `BUNDLER_URL` at a local Alto bundler (`@pimlico/alto`, `--safe-mode false`). The script then funds the wallet and fast-forwards the delay itself.

## Wallet API

All routes use the mocked Swissquote session cookie from `POST /api/session` (`claire@example.com` / `claire`).

| Route | Does |
| --- | --- |
| `POST /api/session` | Mocked sign-in |
| `POST /api/wallet/ceremony` | Tickets a key ceremony (`purpose`: `create` or `recovery`). The phone then runs it against both signers with `runKeyCeremony` |
| `POST /api/wallet` / `GET` | Registers the wallet after the ceremony / reads it |
| `POST /api/wallet/operations` | `{ calls }`: policy, gas estimate, paymaster signature. `{ recovery: { signer, passkey } }`: builds `initiateRecovery` |
| `POST /api/wallet/operations/:hash` | Normal: `{ signature }` from `signOperation`. Recovery: `{ confirmationSignature }`, then Swissquote and the partner co-sign |
| `GET /api/wallet/operations/:hash` | Status from the bundler |
| `POST /api/recovery` | Mocked ID and liveness check |
| `GET` / `DELETE` / `PATCH /api/recovery` | Pending recovery / Swissquote cancels as guardian / finalize after the delay |

## Screens

Sign in at `/sign-in`, then:

| Flow | Screens | Calls |
| --- | --- | --- |
| Create | `/onboarding-welcome`, `/onboarding-secure` | Device Key: `createPasskey`. Swissquote Key: `POST /api/wallet/ceremony`, `runKeyCeremony` in the browser (`dkls-wasm-ll-web`). Recovery Key: a new confirmation key, `POST /api/wallet`, then "Save Recovery Kit" downloads it as a text file |
| Send | `/choose-recipient`, `/send-hide-my-wallet`, `/transaction-tracking` | `POST /api/wallet/operations` shows the policy summary, or the PIN (and selfie) step-up, or the block. Face ID then `signOperation`, `POST /api/wallet/operations/:hash`, and the tracker polls `GET` |
| Recover | `/pending-verification` | `POST /api/recovery`, the Recovery Kit, a new passkey and ceremony (`purpose: recovery`), the recovery operation signed with the kit's key, then a countdown from `GET /api/recovery` with cancel (`DELETE`) and finish (`PATCH`) |

Share A is stored in IndexedDB, AES-GCM encrypted under the passkey's WebAuthn PRF output, so one Face ID both approves a send and decrypts the share (`lib/wallet/browser.ts`). Where the authenticator has no PRF, the key is a non-extractable WebCrypto key stored next to the ciphertext: page scripts can use it but not read it, so it protects less than PRF. The confirmation key exists only in the downloaded Recovery Kit.

## Mocked

Swissquote sign-in and KYC records, the ID and liveness check, the PIN step-up, the HSM (shares are AES-GCM encrypted in SQLite), and the channel between Swissquote and the partner (a pre-shared key instead of mTLS).
