# Swissquote Wallet

Swissquote Wallet is a self-custody crypto wallet that Swissquote could offer its clients. The client holds the keys. Swissquote screens each payment, pays the network fee and helps recover a lost phone. Swissquote cannot move the client's funds, alone or together with the independent service that holds the third key share.

This is a hackathon build. The whole protocol runs on a local chain: the smart account, the key split, the passkey checks, the compliance policy, gas sponsorship and the 48-hour recovery. The parts that need a real bank, such as the client's Swissquote session, the ID check and the HSMs, are mocked. [What is real and what is mocked](#what-is-real-and-what-is-mocked) lists them. <!-- verify: track/identity -->

[protocol.md](protocol.md) is the spec. Where code or this README disagree with it, protocol.md wins. [Shamir key sharing and wallet recovery](docs/SHAMIR_AND_RECOVERY.md) walks through the cryptography and every recovery step. The [pitch summary](PITCH_SUMMARY.md) is the short version for a non-technical audience.

| Submission item | Where |
| --- | --- |
| The end-to-end demo | [The demo story](#the-demo-story) |
| Custody model and threat model | [Custody model](#custody-model), [Threat model](#threat-model) |
| Architecture diagram with mocked parts marked | [Architecture](#architecture) |
| Wallet creation, authentication, recovery | [Wallet creation](#wallet-creation), [Authentication](#authentication), [Recovery](#recovery) |
| Custody and Travel Rule handling | [Legal position](#legal-position) |
| What Swissquote gains | [Business case](#business-case) |
| Bonus topics | [Gasless payments](#bonus-gasless-payments), [Compliant dApp interaction](#bonus-compliant-dapp-interaction), [the attacker with the phone and the email](#the-attacker-with-the-phone-and-the-email) |
| AI tools | [AI tools](#ai-tools) |

## Why

Self-custody asks clients to become security experts. A lost seed phrase loses the funds, and one photo of it gives them away. A signing prompt tells the client little about what they approve.

A Swissquote client who wants their own keys today must whitelist an address, prove they own it and pay USD 10 (native coin) or USD 15 (ERC-20 token) per withdrawal ([pricing](https://www.swissquote.com/en-ch/private/trade/pricing/cryptocurrencies), [external wallets](https://www.swissquote.com/en-ch/private/help/trade/products/crypto-asset-products)). After that, Swissquote no longer sees those assets. With 1.22 million accounts and CHF 96.3 billion in client assets ([H1 2026 results](https://www.swissquote.com/en/api/internal/media/get-media?filename=press-releases%2Fad+hoc_EN_Media_Release_H1_2026.pdf)), every client who leaves for a separate wallet takes future trading with them.

Swissquote Wallet keeps self-custody one tap from the Swissquote account. The client keeps the authority to move funds. Swissquote adds checks before each payment and a recovery path after a lost phone.

## The demo story

One story, end to end: create a wallet, pay with Face ID, lose the phone, recover the wallet. Start the stack first with `npm run local` (see [Run it locally](#run-it-locally)). Use two browsers, or two browser profiles, as the old phone and the new phone.

### 1. Create a wallet

1. In the first browser, open http://localhost:3000/onboarding-welcome. The app opens inside a signed-in Swissquote session with the client's KYC record. Both are mocked. <!-- verify: track/identity -->
2. Tap **Create new wallet**.
3. On `/onboarding-secure`, tap **Create Passkey**. Face ID creates the passkey.
4. Tap **Split Wallet Key**. Face ID runs again and gives the key that seals Share A. The phone splits the wallet key, keeps Share A, sends Share B to Swissquote and sends Share C straight to the independent service.
5. Tap **Save Recovery Key**. The share sheet, or a download, saves `Swissquote Wallet Recovery Key.txt`. Keep it off the phone.
6. The app registers the wallet and opens Home. In a terminal, run `npm run fund`. Home shows 100 USDC.

### 2. Sign in and pay

Face ID is the sign-in. Each payment gets its own Face ID approval over that exact payment.

1. On Home, tap the action button, then **Send**.
2. In the recipient sheet, paste an address and continue.
3. On `/send`, which shows "Network fee: Paid by Swissquote", enter up to 1,000 USDC and tap **Continue**. Swissquote runs its compliance check and sponsors the payment.
4. Tap **Send**. Face ID approves the operation, the phone signs it and Swissquote submits it to the chain. `/transaction-tracking` shows the payment.

A payment above 1,000 USDC also goes with one Face ID, and leaves 24 hours later in chain time. From the terminal, run `npm run account anna`, `npm run fund anna 2000`, `npm run send anna 0x000000000000000000000000000000000000dEaD 2000`, then `npm run warp 24`. [Authentication](#authentication) has the rules. <!-- verify: track/stepup -->

### 3. Lose the phone

The first browser now plays the lost phone. Losing it loses Share A and the passkey. The Recovery Key file and the client's identity are what is left.

### 4. Recover

1. In the second browser, open http://localhost:3000/onboarding-welcome and tap **Recover existing wallet**.
2. On `/recover`, choose the Recovery Key file, or paste the key, and tap **Continue**.
3. On **Confirm it's you**, tap **Scan ID**. The ID check is mocked and matches the client's KYC record. <!-- verify: track/identity -->
4. On **Secure this phone**, tap **Restore with Face ID**. The new phone creates a new passkey and a new wallet key. Swissquote releases the old Share B, and the independent service releases the old Share C. The phone rebuilds the old key for one signature and starts the recovery on-chain.
5. The new phone counts down the 48-hour hold in chain time. Meanwhile, the old phone's Home shows "Someone started recovering your wallet" with **Cancel recovery**.
6. Run `npm run warp` to move chain time 48 hours ahead. Tap **Finish recovery**. The new phone now controls the same address with the same funds.

With a CLI account from `npm run account anna`, the same story runs in the terminal with `npm run recover anna`, `npm run warp` and `npm run finish anna-new`. `npm run e2e` runs it as a test.

### Three more demos

- **An attacker with the phone and the email.** `npm run attack anna` plays a thief who holds the client's phone and email inbox. Every gate refuses them. See [the attacker with the phone and the email](#the-attacker-with-the-phone-and-the-email). <!-- verify: track/identity -->
- **Swissquote is gone.** `npm run sunset`, then `npm run exit anna <address> all`. The client moves everything out with the independent service alone. See [Recovery](#recovery). <!-- verify: track/exit -->
- **Recover a browser wallet from the terminal.** Run `npm run recover ~/Downloads/"Swissquote Wallet Recovery Key.txt"`. The browser plays the old phone and can cancel the recovery from Home.

## Custody model

### We chose a smart account that needs two independent keys

The wallet is an ERC-4337 smart account, `SwissquoteAccount`. Every operation needs two signatures, and the account checks both on-chain:

| Mode | First signature | Second signature | What it may call |
| --- | --- | --- | --- |
| Normal | The wallet key | The passkey on the phone, behind Face ID | Any call, through `execute`. Not `initiateRecovery`. |
| Recovery | The wallet key | The Recovery Key kept at home | Only `initiateRecovery`, which starts a 48-hour delay |

The wallet key is a secp256k1 key split 2-of-3 with Shamir secret sharing. Share A lives on the phone, Share B with Swissquote and Share C with an independent service. Any two shares rebuild the key on the phone. The passkey and the Recovery Key are never split and never leave the client.

We wanted four things. Swissquote must be unable to move funds, even together with its partner, because that is both the legal line for custody and the promise to the client. The client must not need a seed phrase, and daily use must be one Face ID. A lost phone must be recoverable without any single party able to recover it alone. And the build must use established open-source components, not new cryptography.

### Five common models, and why we did not pick one as-is

| Model | How it works | For | Against | Our call |
| --- | --- | --- | --- | --- |
| Custodial | Swissquote holds the keys, as in today's Swissquote crypto account | Simplest for the client. Recovery is a password reset. | It is custody, with the Banking Act duties that come with it. The client holds no keys, which is why self-custody clients leave. | Not chosen. It is the product these clients already leave. |
| Seed phrase | The client's device holds one key, backed up as 12 or 24 words | Full client control. Works on every chain. | One lost phrase loses the funds and one photo gives them away. No screening before signing. Swissquote sees nothing. | Not chosen. It is the problem this project solves. |
| MPC, threshold signatures | The parties hold key shares and sign together. The full key never exists in one place. | No single place ever holds the key. The output is an ordinary signature, so it works on Bitcoin too. | Complex protocols that need an audited library and an audited integration. If Swissquote and its partner hold two of three shares, they can sign without the client. The spending rules live in the parties' servers, not on-chain. | Not chosen. Two servers that can sign alone is the custody problem we set out to remove. |
| Passkey-only smart account | An ERC-4337 account checks a WebAuthn passkey | No seed phrase. Face ID. Rules enforced on-chain. Gas sponsorship. | The passkey is the only factor. Whoever takes over the Apple or Google account that syncs it can spend. Losing it needs a separate recovery scheme. EVM only. | Partly chosen. We keep the account and the passkey, and add a second, independent key. |
| Split backup, Shamir or SLIP-39 | The seed is split into shares held by the user, friends or services. A threshold of shares rebuilds it. | No single backup to lose or steal. An open standard. | Whoever rebuilds the seed holds the whole key and can spend. If services hold enough shares, they can spend. No screening, no delay, no cancel. | Partly chosen. We split the wallet key, but the account also needs the passkey or the Recovery Key, so the shares alone cannot spend. |

Our model is the last two combined. Shamir sharing alone lets two holders spend. A passkey alone has no recovery. Together, two holders who rebuild the key still lack the passkey, and a lost passkey is replaced through the Recovery Key and a delay the client can cancel.

### What our model gets right

- Neither Swissquote nor the independent service can move funds with what they hold, alone or together. Together they can rebuild the wallet key, but the account also needs the passkey for any payment and the Recovery Key to start a recovery.
- There is no seed phrase. Daily use is one Face ID per payment.
- A lost phone is recoverable with the Recovery Key, Swissquote's ID check and both share holders, behind a 48-hour on-chain delay the client can cancel. <!-- verify: track/identity -->
- The address stays the same after recovery, so deposit addresses and allowlists stay valid.
- Swissquote screens and sponsors every payment, and the phone checks Swissquote's operation before Face ID.
- The parts are established open-source code: EntryPoint v0.7 and its sample `VerifyingPaymaster` from eth-infinitism, OpenZeppelin's `WebAuthn` and `ECDSA`, noble-curves, viem and ox.

### What it costs

- **Shamir rebuilds the key on the phone.** This is not threshold signing. The full wallet key exists on the phone at creation, on each cache miss and at recovery, and stays in memory for up to 3 hours. A compromised phone app sees it. The key alone still moves nothing without the passkey.
- **The split is our code.** `lib/wallet/shamir.ts` is 53 lines: a degree-1 polynomial with Feldman commitments, on noble-curves' field and point arithmetic. It needs an audit, or a swap for an audited library, before launch.
- **It is EVM-only.** The passkey and recovery rules live in an EVM contract. Bitcoin script cannot verify a P-256 passkey or hold a cancellable recovery. A Bitcoin path would need a Taproot policy with two branches. The normal branch needs the wallet key and a client key. The recovery branch needs the wallet key and the Recovery Key, and opens only after the coins sit unmoved for a set time (a relative timelock, `OP_CHECKSEQUENCEVERIFY`). The client keeps control by moving the coins through the normal branch before then. The client key would be a secp256k1 key sealed under the phone's secure hardware, as Share A is, because the iPhone's Secure Enclave signs only P-256.
- **Swissquote keeps availability powers.** It can withhold Share B, refuse sponsorship and submission, and cancel any recovery as guardian. None of these moves funds. But a running Swissquote that refuses one client locks that client out once the key cache expires. Exit mode covers Swissquote gone, not Swissquote refusing. <!-- verify: track/exit -->
- **Recovery needs both share holders.** If the independent service is gone when the phone is lost, the funds stay locked until it returns.
- **The Recovery Key cannot be replaced.** The account has no function to change it. A client who loses it moves the funds to a new wallet.

## Threat model

| Who | What they hold | Can they steal? | Can they lock the client out? | What stops them |
| --- | --- | --- | --- | --- |
| Thief with a locked phone | Sealed Share A | No | No. The client recovers with B, C and the Recovery Key. | Share A opens only with the passkey's PRF output, where the authenticator supports PRF. Every operation needs a passkey assertion with Face ID. |
| Thief who can unlock the phone | Share A, the passkey, maybe the cached key | Yes, within Swissquote's limits, up to 5,000 USDC a day | Yes. They can cancel every recovery from the phone during the delay. | Only Swissquote's limits. This is the main residual risk. A lock for a reported phone would fix most of it, and is not built. |
| Thief with the phone and the email inbox | The locked phone and the client's email | No | No | No Face ID, so no passkey. No email reset exists. A forged Recovery Key, or the thief's own ID, is refused. <!-- verify: track/identity --> |
| Thief with the Recovery Key file | The Recovery Key | Only if they pass Swissquote's ID check and the client does not cancel within 48 hours | No | The ID check against the KYC record (mocked), Share C's release rule, the 48-hour delay, and cancel from the old phone or through Swissquote. <!-- verify: track/identity --> |
| Swissquote alone (rogue employee, breached server) | Share B, sponsorship, submission, guardian | No. One share is not the key, and the account also needs the passkey. | Yes. It can withhold B, refuse to sponsor or submit, and cancel recoveries as guardian. The funds stay in the account. | The threshold and the on-chain passkey check. Share C goes from the phone to the independent service directly, at a URL pinned in the app build. |
| Independent service alone | Share C | No | It can refuse C, which blocks recovery. | The threshold. It releases C only for a recovery that Swissquote approved and the bound Recovery Key signed, or in exit mode for an operation the passkey approved. <!-- verify: track/exit --> |
| Swissquote and the independent service together | B and C, so the full wallet key | No. Normal mode needs the passkey. Recovery mode needs the Recovery Key and can only call `initiateRecovery`. | Yes, by both refusing. | The account's second signature in each mode. This is the security claim in protocol.md. |
| Swissquote, with a stolen Recovery Key file | B, approval power and the Recovery Key | Yes, after 48 hours, unless the client cancels. Both cancel paths in the app run through Swissquote, so a hostile Swissquote can block the cancel for the whole 48 hours. | Yes | Only the client keeping the Recovery Key file safe. Production should have the independent service alert the client on every release of Share C. |
| Swissquote's server tampering with an operation | The UserOperation it builds | No | No | Before Face ID, the phone checks the sender and the callData, checks that a paymaster is set, and recomputes the hash. The paymaster, not the client, pays any gas Swissquote sets. |
| Malicious app build | Code next to Share A and the passkey | Yes, in theory | Yes, in theory | Out of scope for the protocol. In the web build, Swissquote's server serves the phone's code, so the web build trusts Swissquote. The iOS build bundles the code. Production needs a native app, reproducible builds and audits. |

Refusing assistance never freezes the account on-chain. It does stop the client from transacting once the key cache expires, because Share B and sponsorship both come from Swissquote.

**Who could steal funds?** Someone who can unlock the client's phone, within Swissquote's payment limits. Someone with the Recovery Key file who passes Swissquote's ID check, if the client does not cancel within 48 hours. A malicious app build. No server, alone or with the other server, can. <!-- verify: track/identity -->

**Who could lock the client out?** Swissquote, by withholding Share B or sponsorship, or by cancelling recoveries as guardian. The independent service, by refusing Share C, which blocks recovery. A thief with the unlocked phone, by cancelling recoveries. The client, by losing the phone and the Recovery Key together.

**Could Swissquote alone, or with the partner, move the funds without the client?** No. Together they can rebuild the wallet key, but the account also needs the passkey for any payment. Starting a recovery needs the Recovery Key, and a recovery replaces the keys only after 48 hours that the client can cancel. They could take the wallet only with something the client holds: a stolen Recovery Key file, or a malicious app build the client runs.

## Architecture

```mermaid
flowchart LR
  subgraph phone["Client's phone: the Swissquote Wallet app"]
    sdk["Phone SDK, lib/wallet/phone.ts<br/>Share A sealed by the passkey<br/>wallet key cached up to 3 h"]
    pk["Passkey, P-256<br/>in the phone's secure hardware"]
  end
  rk["Recovery Key file<br/>kept at home"]

  subgraph sq["Swissquote API: Next.js route handlers, app/api"]
    api["Wallet API"]
    comp["Compliance engine<br/>sanctions and simulation are<br/>fixtures in demo mode"]
    vb[("Share B vault<br/>SQLite, AES-GCM, no HSM")]
    kyc["MOCKED: client session,<br/>KYC record, recovery ID check"]:::mock
  end

  subgraph ind["Independent service: own process, own database"]
    partner["services/partner/server.ts"]
    vc[("Share C vault<br/>SQLite, AES-GCM, no HSM")]
  end

  subgraph chain["Chain: local anvil, or Base Sepolia"]
    ep["EntryPoint v0.7"]
    pay["VerifyingPaymaster<br/>Swissquote's gas deposit"]
    acc["SwissquoteAccount<br/>wallet key + passkey, or<br/>wallet key + Recovery Key"]
    usdc["USDC"]
  end

  pk -- "Face ID assertion" --> sdk
  rk -. "recovery only" .-> sdk
  sdk -- "calls to sponsor, Share B requests,<br/>signed operations, recovery" --> api
  sdk -- "Share C at creation,<br/>Share C requests" --> partner
  api --> comp
  api --> vb
  api --> kyc
  api -- "checks the Recovery Key binding" --> partner
  partner --> vc
  api -- "handleOps, from Swissquote's key" --> ep
  ep --> pay
  ep --> acc
  acc --> usdc
  partner -. "reads the signer" .-> acc
  sdk -. "exit mode only: handleOps, own gas" .-> ep

  classDef mock stroke-dasharray: 5 5
```

The dashed box is mocked. <!-- verify: track/identity --> Everything else runs for real in this build. The independent service runs as a real separate process with its own database, but the company behind it is a stand-in. The dotted line to the EntryPoint is exit mode, used only when Swissquote is gone. <!-- verify: track/exit -->

**Smart account** (`contracts/`, Foundry). `SwissquoteAccount` runs on EntryPoint v0.7. Its config holds the wallet key's address, the passkey's P-256 public key, the Recovery Key's address and Swissquote as guardian.

- Normal mode needs a wallet-key ECDSA signature and a WebAuthn assertion, both over the userOpHash. It cannot call `initiateRecovery`.
- Recovery mode needs the wallet key and the Recovery Key. It can only call `initiateRecovery`.
- `RECOVERY_DELAY` is a constant 48 hours. `cancelRecovery` accepts the guardian or the account itself (the phone, with passkey and key). `finalizeRecovery` is open to anyone after the delay.
- `SwissquoteAccountFactory` deploys CREATE2 clones, so the address is known before deployment.
- Swissquote's `VerifyingPaymaster`, the eth-infinitism sample, pays gas.
- `script/Deploy.s.sol` deploys the factory and the funded paymaster. On a local chain (31337) it also deploys an EntryPoint and a mintable test USDC.

**Key split** (`lib/wallet/shamir.ts`). Shamir over the secp256k1 group order, with Feldman commitments. Each holder verifies its share against the commitments before storing it.

**Phone SDK** (`lib/wallet/phone.ts`). Keeps Share A sealed with AES-GCM under the passkey's WebAuthn PRF output, so only Face ID opens it, where the authenticator supports PRF. Builds every call itself. Before Face ID, it checks Swissquote's UserOperation (the sender, the callData and that a paymaster is set) and recomputes its hash. On a cache miss, the same Face ID assertion fetches Share B. At onboarding it sends Share C straight to the independent service at a URL pinned in the app build (`NEXT_PUBLIC_PARTNER_URL`), so Swissquote never sees C.

**Swissquote Wallet API** (`app/api`, Next.js route handlers). Holds Share B in SQLite, sealed with AES-GCM. It runs the compliance check, signs sponsorship and submits operations to the EntryPoint itself, with no external bundler.

- `POST /api/shares` stores Share B and gives the phone a signed ticket for the independent service.
- `POST /api/wallets` registers a wallet. The wallet key must sign the Recovery Key binding.
- `GET /api/wallets/:address` reads a wallet: its keys, USDC balance, any pending recovery and the chain's time. `GET /api/wallets/:address/activity` lists its USDC transfers. `GET /api/config` returns the chain ID and the EntryPoint and USDC addresses.
- `POST /api/wallets/:address/operations` runs compliance and sponsorship for a call.
- `POST /api/wallets/:address/share` releases Share B for a passkey-approved operation.
- `POST /api/wallets/:address/operations/:hash` submits the signed operation.
- `POST /api/recovery` runs the mocked ID check and prepares `initiateRecovery`. `GET /api/recovery` finds the wallet a Recovery Key restores and any recovery already pending.
- `POST`, `DELETE` and `PATCH /api/wallets/:address/recovery` release B for a Recovery-Key-signed recovery, cancel as guardian when the Recovery Key asks, and finalize.

**Independent service** (`services/partner/server.ts`). Its own process and database. It stores Share C only for a key Swissquote ticketed, learns the Recovery Key only from a wallet-key signature, and releases C only for an `initiateRecovery` that Swissquote approved and the bound Recovery Key signed. It never takes part in a normal payment. At recovery only the new phone holds B and C together, for one signature. In exit mode it also releases C for a passkey-approved operation. <!-- verify: track/exit -->

**Compliance** (`lib/compliance`, `services/compliance`, `app/api/compliance`). The policy engine that decides whether Swissquote assists. See [Compliant dApp interaction](#bonus-compliant-dapp-interaction).

**App** (Next.js 16, and an iOS build with Capacitor).

- Create: `/onboarding-welcome`, then `/onboarding-secure`. Creates the passkey, splits the wallet key, saves the Recovery Key file and registers the wallet.
- Home, History, Receive and Settings read one shared wallet store (`app/(tabs)/_components/wallet.ts`). It refreshes every 4 seconds and when the app regains focus, so a payment, a recovery started elsewhere or a warped chain shows without a reload. Cash, its activity and the Investments screen's USDC row are real. The Investments, Earn and Card tiles on Home show zero. Swap and Swissquote Plus are demo screens.
- Home: the real balance. On the old phone a pending recovery shows an alert with **Cancel recovery**. A wallet recovered elsewhere, or one the chain no longer knows, offers to remove it from the phone.
- Send: `/choose-recipient`, `/send`, `/transaction-tracking`.
- Recover: `/recover`. Loads the Recovery Key file, runs the mocked ID check, creates a new passkey and split, then counts down the 48-hour hold in chain time, with **Finish recovery** and **Cancel recovery**.

## Wallet creation

Every key is generated on the client's phone. Swissquote and the independent service each receive one share and check it before storing it.

| Key | Generated | Lives | When it leaves its holder |
| --- | --- | --- | --- |
| Passkey (P-256) | By the phone's authenticator, behind Face ID, at **Create Passkey** | The authenticator, in the phone's secure hardware | Only its public key, which goes into the account's config |
| Wallet key (secp256k1) | On the phone, by `split()` in `lib/wallet/shamir.ts`, from noble-curves' secure random generator | Nowhere at rest. The phone keeps it in memory for up to 3 hours and drops it when the app closes. | Never as a whole. Its shares go to the three holders. |
| Share A | The same split, at x = 1 | The phone's storage, AES-GCM sealed under the passkey's PRF output and bound to the signer address | Never |
| Share B | The same split, at x = 2 | Swissquote's vault | To a phone, for a passkey-approved operation or a Recovery-Key-signed recovery |
| Share C | The same split, at x = 3 | The independent service's vault | To a new phone, for a recovery Swissquote approved and the Recovery Key signed, or in exit mode for a passkey-approved operation <!-- verify: track/exit --> |
| Recovery Key (secp256k1) | On the phone, by viem's `generatePrivateKey` | The file `Swissquote Wallet Recovery Key.txt`, which the client keeps off the phone | Only its address and its signatures |

Creation runs in this order:

1. The phone creates the passkey.
2. The phone splits a fresh wallet key into Shares A, B and C with Feldman commitments.
3. The phone sends Share B, the commitments and the passkey's public key to `POST /api/shares`. Swissquote checks B against the commitments, stores it and returns a ticket it signed, valid for 5 minutes.
4. The phone sends Share C and the ticket straight to the independent service. The service checks Swissquote's signature, the ticket's expiry and C against the commitments, then stores C.
5. The phone seals Share A under the passkey's PRF output and keeps it.
6. The phone creates the Recovery Key and saves its file. The wallet key signs a statement naming the Recovery Key's address. Both holders record it once and refuse to rebind it.
7. `POST /api/wallets` registers the wallet. Swissquote computes the account's address with the factory. The first operation deploys the account.

The wallet links to the client's Swissquote identity at creation. The wallet is created inside the signed-in Swissquote app. Registration stores the client's Swissquote client number with the wallet. The wallet key also signs an ownership statement that names the client, and Swissquote keeps it. That statement is the Travel Rule ownership proof, made with no extra step from the client. The client session and its KYC record are mocked. <!-- verify: track/identity -->

Without WebAuthn PRF support, Share A sits unsealed in web storage. The native app would keep it under a Secure Enclave or Keystore key instead.

## Authentication

The client proves who they are with the passkey, behind Face ID, for every operation. The wallet itself uses no password, SMS code or email link, so there is nothing to phish by email.

1. The phone builds the call and asks Swissquote to sponsor it.
2. Swissquote runs compliance and returns a sponsored UserOperation.
3. The phone checks the sender and the callData, checks that a paymaster is set, and recomputes the hash.
4. Face ID unlocks the passkey, which signs that exact hash.
5. If the wallet key is not cached, the same assertion fetches Share B. Swissquote checks it against the wallet's passkey and the prepared operation first.
6. The phone rebuilds the key from A and B, signs the same hash and sends both signatures to Swissquote, which submits them.
7. The account checks the wallet key's signature and the WebAuthn assertion on-chain.

The account's check, OpenZeppelin's `WebAuthn.verify`, requires the authenticator's user-verified flag. A passkey prompt that skipped Face ID or the device passcode fails on-chain. Swissquote's API checks the same flag before it releases Share B.

The binding to the device comes from Share A. Platform passkeys can sync through iCloud Keychain or Google Password Manager, but Share A never leaves the phone. A synced copy of the passkey on another device gets at most one share. Swissquote releases B for a passkey-approved operation, but the independent service releases C only for a recovery or, once Swissquote is gone, in exit mode. <!-- verify: track/exit -->

A cached key skips fetching Share B. It never skips Face ID.

Small and large payments differ. These are the local policy's numbers: <!-- verify: track/stepup -->

| Payment | What the client does | What happens |
| --- | --- | --- |
| Up to 1,000 USDC | One Face ID | It leaves at once. |
| Above 1,000 USDC, within the limits | One Face ID | It leaves 24 hours later in chain time. The client can cancel it until then. Compliance runs again before release. |
| Above 10,000 USDC in one payment, or above 5,000 USDC in 24 hours | Nothing | Swissquote refuses it. |

With these numbers the daily limit binds first, so in practice one payment above 5,000 USDC is refused. The limits and the hold are Swissquote's assistance rules, enforced by its servers. The account itself enforces only the signatures. <!-- verify: track/stepup -->

## Recovery

| What happened | Who is involved | How long | What stops an attacker |
| --- | --- | --- | --- |
| Phone lost or destroyed | The client with a new phone and the Recovery Key file. Swissquote checks the ID and releases Share B. The independent service releases Share C. | A few minutes of setup, then 48 hours of chain time | The Recovery Key must sign the exact recovery. The ID check must match the KYC record (mocked). <!-- verify: track/identity --> C is released only with Swissquote's approval and the Recovery Key's signature. The old phone shows the pending recovery and can cancel it, and Swissquote cancels it when the Recovery Key asks. |
| Phone stolen and locked | The same as a lost phone | The same | The thief cannot open Share A or make a passkey assertion, so they can neither pay nor cancel the recovery. |
| Phone stolen and unlocked | The same as a lost phone | The same, but the thief can cancel each recovery from the phone | Only Swissquote's limits. The fix is a lock for a reported phone. Swissquote would refuse Share B, sponsorship and submission for that wallet, which leaves the thief only the cached key for up to 3 hours. Not built. |
| Recovery Key lost, phone fine | The client | Minutes, then days for a large balance | The account cannot change its Recovery Key. The client creates a new wallet with a new Recovery Key and moves the funds there, within the 5,000 USDC daily limit. The app holds one wallet per phone, so in this build the new wallet needs a second phone or browser profile. |
| Phone and Recovery Key both lost | Nobody can help | Never | No one can replace the keys without the Recovery Key. This is the cost of Swissquote having no power to move funds. |
| Independent service gone | The client and Swissquote | Payments: no change. Recovery: blocked until C is available. | Payments use A and B and keep working. A lost phone cannot be recovered without C. Production: the service's contract names a successor that takes over its vault. |
| Swissquote gone | The client and the independent service | 30 days after Swissquote's services stop, then minutes | Exit mode. The independent service releases Share C only for an operation approved by the passkey, which it verifies against the account's on-chain passkey. The phone rebuilds the key from A and C and submits straight to the EntryPoint, paying its own gas. <!-- verify: track/exit --> |

A recovery runs like this:

1. The new phone loads the Recovery Key and creates a new passkey and a new wallet key, split into new shares A', B' and C'. The new key binds itself to the same Recovery Key at both holders.
2. `POST /api/recovery` runs the ID check and prepares `initiateRecovery(newSigner, newPasskey)`. The phone checks that the operation carries exactly that call and recomputes its hash. <!-- verify: track/identity -->
3. The Recovery Key signs the operation hash.
4. Swissquote checks that signature against the Recovery Key bound to the old key, releases the old Share B and signs a recovery approval that expires after 5 minutes.
5. The independent service checks the approval, recomputes the hash, checks the call is `initiateRecovery`, checks the Recovery Key's signature and releases the old Share C.
6. The new phone rebuilds the old key from B and C, signs once and submits in recovery mode. The account records the new key and passkey and sets `executeAfter` to now plus 48 hours.
7. During the delay, the old phone can cancel with a normal operation, or Swissquote cancels as guardian when the Recovery Key asks.
8. After the delay anyone can call `finalizeRecovery`. The account installs the recorded key and passkey. The address, the funds and the Recovery Key stay the same.

During the delay the old keys still work. Recovery is not a freeze.

Both cancel paths run through Swissquote. The old phone's cancel needs Swissquote's sponsorship and, on a cache miss, Share B. The guardian cancel is a transaction from Swissquote's own key.

Exit mode does not cover a phone lost while Swissquote is gone. The production answer is to escrow Share B with the independent service under Swissquote's resolution plan. That is safe because B and C together cannot move funds without the passkey or the Recovery Key. <!-- verify: track/exit -->

### The attacker with the phone and the email

`npm run attack <account>` plays a thief who stole the client's phone and has their email inbox. It tries every way in and prints each refusal: <!-- verify: track/identity -->

1. **Pay from the phone.** Without the client's Face ID there is no passkey assertion. Swissquote refuses Share B and the account would refuse the operation.
2. **Reset by email.** No email reset exists. The wallet uses no email at any step.
3. **Recover with a forged Recovery Key.** No wallet is bound to that key, so Swissquote finds nothing to recover and the independent service refuses Share C.
4. **Pass the ID check with their own ID.** The ID does not match the client's KYC record, so Swissquote refuses to prepare the recovery.
5. **Wait out a recovery.** Any recovery that does start sits behind the 48-hour delay, and the client cancels it through Swissquote with the Recovery Key.

## Legal position

Research checked on 10 October 2026, against Swiss law including the 1 October 2026 AMLA and AMLO amendments ([FINMA notice](https://www.finma.ch/en/documentation/dossier/dossier-geldwaeschereibekaempfung/hinweise-zur-revision-des-geldwaeschereigesetzes-und-der-geldwaeschereiverordnung/)). This is engineering research, not legal advice or FINMA approval. Our proposition is client-controlled assets with regulated bank assistance.

### Why this is not custody

Crypto custody under the Banking Act turns on an undertaking to keep assets available for the client and allocated to them ([BankA Art. 16 no. 1bis and Art. 37d](https://www.fedlex.admin.ch/eli/cc/51/117_121_129/de), [FINMA Guidance 01/2026](https://www.finma.ch/en/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20260112-finma-aufsichtsmitteilung-01-2026.pdf)). The practical test is who can move the funds. We argue Swissquote cannot:

- The power of disposal sits with the client. The account accepts a transfer only with the passkey, which lives in the client's phone. No Swissquote key meets that rule, alone or combined with the independent service's. Anyone can read the rule in the deployed contract.
- The assets sit in the client's own account contract, not in Swissquote's name or on its books. Swissquote offers screening, gas and recovery help. It does not undertake to keep the assets available.
- Swissquote's remaining powers are availability powers. Withholding Share B, refusing sponsorship and cancelling a recovery as guardian decide whether Swissquote helps. None of them moves an asset or changes who controls it.

The weak point is practical. While Swissquote runs, withholding Share B stops the client from paying once the key cache expires. A regulator could read that as control. Exit mode answers this for a Swissquote that is gone. <!-- verify: track/exit --> For a Swissquote that refuses one client, we propose two answers. The client contract allows refusal only on a legal ground. In production, the independent service would also open exit mode for that client after a notice period. That second answer is a design, not built. Counsel must weigh these powers. The licensing reform consulted on from October 2025 is not a launch permission ([SIF consultation](https://www.sif.admin.ch/en/newnsb/x4TMWQ1SWofNoFx7XyHhY)).

### Shared control with the independent service

Shared control between a bank and a partner is a grey zone when the two together can move funds. Here they cannot. Together they can rebuild only the wallet key, and the account refuses any transfer without the passkey and any recovery without the Recovery Key. So even combined, Swissquote and the independent service lack the power of disposal. What remains of the grey zone is the availability powers above, not disposal.

The independent service holds a usable share, so its AML and outsourcing role needs its own review ([FINMA outsourcing](https://www.finma.ch/en/news/2017/12/20171205-mm-rs-outsourcing/)).

### Travel Rule

Payment orders carry originator and beneficiary data ([AMLO-FINMA Art. 10](https://www.fedlex.admin.ch/eli/cc/2015/390/de)). FINMA applies this to crypto with no self-hosted-wallet exemption, and transfers to a client's own wallet need ownership proven by suitable technical means ([FINMA Guidance 02/2019](https://www.finma.ch/en/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20190826-finma-aufsichtsmitteilung-02-2019.pdf)). FINMA has described suitable methods, including a message to the blockchain within a set time and time-boxed transfers ([2020 annual report, pp. 43 to 44](https://www.finma.ch/~/media/finma/dokumente/dokumentencenter/myfinma/finma-publikationen/geschaeftsbericht/20200325-finma-jahresbericht-2020.pdf), [AML supervision 2022](https://www.finma.ch/en/documentation/dossier/dossier-geldwaeschereibekaempfung/geldwaeschereiaufsicht-2022/)).

Swissquote Wallet makes the proof automatic. The wallet is created inside the signed-in Swissquote app, registration stores the client number, and the wallet key signs an ownership statement naming the client. Swissquote holds that proof from the moment the wallet exists, so a transfer between the client's Swissquote account and the wallet needs no whitelisting form and no test transfer. <!-- verify: track/identity -->

Swissquote taking part in wallet creation is useful evidence, not automatic acceptance. A production proof should verify the account itself through [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) with a fresh single-use challenge, since [EIP-712](https://eips.ethereum.org/EIPS/eip-712) gives no replay protection by itself. `SwissquoteAccount` does not implement ERC-1271 yet. A recovery swaps the wallet key, so the statement must be signed again after each recovery.

### Is Swissquote the sending institution?

When the client pays a third party from the wallet, the client signs and the client's account sends. Swissquote screens the call, pays the gas and relays the signed operation. It cannot change the recipient or the amount, because the phone checks the operation before Face ID and the account checks the signatures.

Our position is that Swissquote is not the ordering institution for that transfer. It never holds the assets and never decides to send them. It is still a financial intermediary for the assistance itself. AMLO Art. 4(1)(b) covers helping transfer virtual currencies to third parties in a continuing relationship, even without power of disposal ([AMLO](https://www.fedlex.admin.ch/eli/cc/2015/791/de), [2021 explanatory report, section 5.7](https://www.newsd.admin.ch/newsd/message/attachments/67150.pdf)). So KYC, monitoring and sanctions duties apply to every sponsored payment.

Until FINMA or counsel confirms that reading, we would launch conservatively and treat each sponsored payment as if Swissquote were the ordering institution:

- A payment to an address Swissquote can attribute to another institution, such as an exchange deposit address, gets originator and beneficiary data sent through a Travel Rule protocol before Swissquote sponsors it. If the receiving institution cannot take the data, Swissquote does not sponsor the payment.
- A payment to another self-hosted wallet keeps the 1,000 USDC hold and the limits, and above that threshold asks the client for the beneficiary's name.
- Swissquote records originator data for every sponsored payment.

This posture is a design. This build exchanges no Travel Rule messages.

### Other rules that apply

- **AML.** Swissquote is a bank and already under AMLA, which now expressly covers Embargo Act breaches ([AMLA](https://www.fedlex.admin.ch/eli/cc/1998/892_892_892/de)). The policy engine supplies technical controls. KYC, monitoring, MROS reporting and case management stay in bank processes.
- **Sanctions.** Swiss sanctions follow SECO ordinances, which can target people, ownership, geography and services, not just addresses ([SECO](https://www.seco.admin.ch/de/sanktionen), [FINMA notice of 20 August 2026](https://www.finma.ch/en/news/2026/08/20260820-sr/)). Refusing sponsorship stops Swissquote's help. Counsel decides the lawful response to an actual order.
- **dApps and tokens.** An allowlist entry is not an exemption. Token function decides FinSA and CISA scope, and an ERC-4626 vault is not a fund exemption ([FINMA token guidance](https://www.finma.ch/en/news/2018/02/20180216-mm-ico-wegleitung/), [FinSA](https://www.fedlex.admin.ch/eli/cc/2019/758/en), [CISA](https://www.fedlex.admin.ch/eli/cc/2006/822/de)).
- **Recovery.** The 48-hour delay is a design choice, not a statutory period. A mocked ID check proves the flow, not identity assurance. Production recovery falls under FINMA's operational-risk and fraud expectations ([Circular 2023/1](https://www.finma.ch/~/media/finma/dokumente/dokumentencenter/myfinma/rundschreiben/finma-rs-2023-01-20221207.pdf?sc_lang=en), [digital-fraud guidance](https://www.finma.ch/en/news/2026/04/20260409-mm-am-02-2026-digitale-betrugsrisiken/)).
- **Privacy and records.** Wallet data can be personal data and biometrics are sensitive ([FADP](https://www.fedlex.admin.ch/eli/cc/2022/491/en)). Showing one client that another banks with Swissquote would touch banking secrecy (BankA Art. 47). AML records are kept at least ten years after the relationship or transaction ends ([AMLA Art. 7](https://www.fedlex.admin.ch/eli/cc/1998/892_892_892/de)).
- **EU.** MiCA's exclusion covers pure non-custodial wallet software, not every bank service reached through one ([MiCA recitals 22 and 83](https://eur-lex.europa.eu/eli/reg/2023/1114/oj/eng)). The Transfer of Funds Regulation requires an ownership assessment for self-hosted transfers above EUR 1,000, which is not a general exemption below it ([Regulation 2023/1113](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1113)). Swissquote's MiCA authorisation sits with Swissquote Bank Europe SA ([AMF register](https://www.amf-france.org/fr/espace-epargnants/proteger-son-epargne/listes-blanches/psca/swissquote-bank-europe-sa)) and needs per-feature checks.

Staking, loans, cards and wealth services are out of scope and need their own assessments.

### Questions for counsel before a real launch

- Do Swissquote's powers here (withholding Share B, guardian cancel, sponsorship) amount to custody in any phase?
- What permissions, supervision and contracts does the independent service need, including for exit mode?
- Is the ownership proof acceptable before deployment and after recovery swaps the key?
- Is Swissquote the ordering institution for a sponsored transfer, and which third-party-wallet flows are allowed?
- Which sanctions lists, service restrictions and reporting procedures apply?

## Business case

A Swissquote client who wants their own keys today pays USD 15 to move USDC to an external wallet. Swissquote then loses sight of the coins, and some clients take the whole account with them. Across its 1.22 million accounts, Swissquote earns about CHF 600 a year and holds about CHF 79,000 of client assets per account. Each client who leaves takes both. Swissquote Wallet keeps that client one tap from trading. For 10,000 wallets in the first year, we assume 1 client in 10 would otherwise have left Swissquote and 1 in 10 is new to it. That gives 2,000 clients × CHF 600 = CHF 1.2 million a year, and CHF 79 million of assets stays at Swissquote with the 1,000 clients kept. The fee lines about cancel out. Swaps at the published 1% fee and Swissquote Plus earn CHF 620,000 a year. Free transfers into the wallet and sponsored gas cost CHF 612,000, counting one dollar as one franc, which overstates them. Costs also fall, by amounts no public figure shows. There is no seed phrase to support, recovery is one scripted in-app flow, and coins in the client's own wallet need none of the cold storage, multi-signature wallets and sub-custodians that Swissquote runs for the crypto it holds ([Annual Report 2025](https://www.swissquote.com/en/api/internal/media/get-media?filename=2026-03/Annual%20Report%20full%20report_18.03.2026_vFINAL.pdf), p. 115). The case does not depend on crypto prices. Net crypto assets income fell 66% to CHF 14.6 million in H1 2026, but the CHF 600 counts the whole account.

| Input | Source or assumption | Value |
| --- | --- | --- |
| Accounts on 30 June 2026 | [H1 2026 results](https://www.swissquote.com/en/api/internal/media/get-media?filename=press-releases%2Fad+hoc_EN_Media_Release_H1_2026.pdf), p. 1. Includes 423,409 Yuh accounts with CHF 4.0 billion of assets (p. 7). Without Yuh, assets per account rise to about CHF 116,000, so our averages are low. | 1.22 million |
| Client assets on 30 June 2026 | H1 2026 results, p. 1 | CHF 96.3 billion, about CHF 79,000 per account |
| Net revenues expected for 2026 | H1 2026 results, p. 3. The first half brought CHF 364.2 million (p. 1). | CHF 730 million, about CHF 600 per account a year |
| Crypto trading fee | [Crypto pricing](https://www.swissquote.com/en-ch/private/trade/pricing/cryptocurrencies), Standard tier, under USD 6,000 traded in 30 days | 1% |
| Withdrawal fee to an external wallet | Crypto pricing, withdrawal fees | USD 15 for USDC, USD 10 for BTC or ETH |
| Wallets in the first year | Assumption, 0.8% of accounts | 10,000 |
| Clients kept | Assumption, 1 wallet client in 10 would otherwise have left Swissquote | 1,000 × CHF 600 = CHF 600,000 a year, and 1,000 × CHF 79,000 = CHF 79 million of assets |
| New clients | Assumption, 1 wallet client in 10 is new to Swissquote. We count no assets for them. | 1,000 × CHF 600 = CHF 600,000 a year |
| Swaps in the app | Assumption, CHF 5,000 per wallet a year at the 1% fee | 10,000 × CHF 50 = CHF 500,000 a year |
| Swissquote Plus | Assumption, 1 wallet client in 10 at CHF 10 a month. The app's Plus screen is a demo, and the price is our guess. | 1,000 × CHF 120 = CHF 120,000 a year |
| Free transfers into the wallet | Assumption, 4 a year per wallet, each waiving the USD 15 fee | 10,000 × USD 60 = USD 600,000 a year forgone |
| Sponsored gas | Assumption, 24 payments per wallet a year at USD 0.05 on a layer-2 chain | 10,000 × USD 1.20 = USD 12,000 a year |
| Net | Sum of the lines above, counting USD 1 as CHF 1. The 2025 closing rate was CHF 0.79 (Annual Report 2025, p. 64), so this overstates the costs. | About CHF 1.2 million a year |

## Bonus: gasless payments

Swissquote pays every fee. Its `VerifyingPaymaster`, the eth-infinitism v0.7 sample, holds an ETH deposit at the EntryPoint (10 ETH on the local chain) and pays for each operation Swissquote signed. Swissquote's own key submits operations to `EntryPoint.handleOps`, so there is no bundler and the client never holds ETH. A guardian cancel and a finalize are plain transactions from the same key.

Abuse is limited by what Swissquote agrees to sign:

- Swissquote sponsors only operations its compliance engine allows. A payment above 1,000 USDC waits 24 hours and is checked again before release. `REVIEW` and `DENY_ASSISTANCE` are refused. <!-- verify: track/stepup -->
- The API accepts only calls to the account's `execute`. It refuses any call to the account itself except `cancelRecovery`. The compliance engine passes only reviewed functions on allowlisted contracts.
- Each sponsorship expires 120 seconds after it is signed (the paymaster's `validUntil`), and the API refuses a prepared operation older than that. Each prepared operation can be submitted once.
- Gas limits are fixed per operation: 300,000 for the call, 1,000,000 for verification, 50,000 before verification and 100,000 for the paymaster.
- The API simulates `handleOps` before it submits, which catches a bad signature, sponsorship or nonce before Swissquote pays. A call that reverts inside the account still costs Swissquote its gas. Live mode's compliance simulation refuses such a call first, but demo mode's does not.

Not built: a sponsorship budget or rate limit per wallet, a gas price cap, a minimum payment amount, authentication on `POST /api/wallets/:address/operations`, and monitoring of the paymaster deposit. Today a client could send many zero-value transfers at Swissquote's cost. Production would tie sponsorship to the Swissquote session and give each wallet a daily budget.

## Bonus: compliant dApp interaction

Every payment Swissquote sponsors goes through the compliance engine first. `ALLOW` is sponsored at once. `STEP_UP`, above 1,000 USDC, is held 24 hours and checked again. `REVIEW` and `DENY_ASSISTANCE` are refused. <!-- verify: track/stepup --> A refusal shows its reasons to the client, stops Swissquote's assistance and never freezes the wallet.

The engine runs these checks:

1. **Decode and allowlist.** Only reviewed functions pass: ERC-20 `transfer` and finite `approve`, ERC-4626 `deposit`, `withdraw` and `redeem`, and batches of up to 16 calls. The contract, the function and the token must be in the policy, and a claimed dApp origin must be listed. It refuses unlisted contracts and functions, unknown calldata, unlimited approvals, `setApprovalForAll`, delegatecalls, account administration and unsupported chains. Fresh local deployments allow USDC `transfer` and finite `approve` for the deployed test vault, plus its ERC-4626 functions. Existing persisted policies are preserved.
2. **Sanctions screening.** TRM Labs' address sanctions endpoint in live mode, fixtures in demo mode. In demo mode, `0x098B716B8Aaf21512996dC57EB0615e2383E2f96` is the sanctioned fixture. Every address the call touches is screened, including addresses the simulation finds.
3. **Simulation.** In live mode, viem's `simulateCalls` over `eth_simulateV1`, from the account's address. The engine refuses an operation whose simulation removes more of an asset than the decoded call intends, or does not confirm the intended amount. Demo mode derives the changes from the decoded call without a chain call.
4. **Limits and extra checks above a threshold.** Limits are integer token base units, never floating-point or CHF estimates. The local policy holds a payment above 1,000 USDC for 24 hours, caps one payment at 10,000 USDC and sets a 5,000 USDC daily limit. On the local chain the daily limit counts what the account sent in the last 24 hours of chain time. <!-- verify: track/stepup -->
5. **A signed decision.** An expiring Ed25519 decision, appended to a SHA-256 hash-chained audit log. A failed append blocks the decision.

Outages and missing evidence never fall back to `ALLOW`.

The engine writes a plain-language summary of each call, such as "Send 20 USDC to 0x…". The API returns it with each prepared operation, and `npm run demo:compliance` prints it. The Send screen does not show it. It shows the amount, the recipient and "Network fee: Paid by Swissquote".

The engine also has a standalone HTTP API for other backends: `POST /api/compliance/evaluate`, `GET /api/compliance/keys` and `GET /api/compliance/registry`. Each call needs `Authorization: Bearer <COMPLIANCE_API_KEY>` and an `X-Compliance-Subject` header set by the trusted bank backend. Never ship the key to a browser.

**Reviewed dApps frontend:** Home links to `/dapps`, a policy-derived ERC-4626 catalogue with deposit, withdrawal, exact-amount approval and revoke-permission flows. Each call uses the existing phone signing API, compliance gate and paymaster. Decisions, demo evidence, expiry, remaining allowance and confirmed transaction hashes are visible. Fresh local deployments include a real test vault with no yield; deposits use two separately reviewed transactions where approval is needed. See [dApp integration and verification](docs/DAPP_INTEGRATION.md) for the backend boundary, safe handling of existing chains and test commands.

Known limits:

- Live mode has no bank usage ledger yet. Operations under a daily cap return `REVIEW` until one is connected with atomic spending reservations.
- The audit file is single-process. A local hash chain cannot prove completeness or stop an operator rewriting history. Production needs shared, durable, externally anchored storage.
- A TRM `CLEAR` means no match in that response. It is not SECO coverage, KYT or Travel Rule clearance.
- Simulation is predictive. It is not proof against malicious tokens or state changes before inclusion.

## What is real and what is mocked

Real in this build: the Shamir split with verified shares, passkeys verified on-chain, the ERC-4337 account and factory, Swissquote's paymaster, the 48-hour on-chain delay and cancel, the independent service as a separate process with its own storage, the compliance engine with signed decisions and its audit chain, the held payment above 1,000 USDC, and exit mode. <!-- verify: track/stepup --> <!-- verify: track/exit -->

| Mocked here | Production |
| --- | --- |
| The signed-in Swissquote session and the client's KYC record <!-- verify: track/identity --> | The authenticated Swissquote app and the bank's KYC system |
| The ID document and liveness check during recovery. **Scan ID** sends fixed strings, matched against the mocked KYC record. <!-- verify: track/identity --> | A real identity provider with liveness, matched to the KYC record |
| HSMs. Shares B and C are AES-GCM sealed in SQLite. | HSMs at Swissquote and at the independent service |
| Share A and the key cache live in a web app. Without PRF, Share A sits unsealed in web storage. | The Swissquote iOS and Android apps, with Secure Enclave or Keystore |
| Fixture sanctions and simulation in demo mode | Live mode with contracted list coverage and a bank usage ledger |
| The independent service is a process, not a company. | A separate, supervised company under contract |
| A local anvil chain | Base Sepolia, then Base mainnet |
| The Investments, Earn and Card tiles show zero, and Swap and Swissquote Plus are demo screens. Only `anna.eth` resolves as a recipient name, from a fixed list. | Swissquote's products, and real name resolution |

Not built:

- A lock for a reported phone. Swissquote would refuse Share B, sponsorship and submission for it.
- Alerts on every channel when a recovery starts. Today only the old phone's Home shows it.
- Exit when the phone is lost and Swissquote is gone at the same time. <!-- verify: track/exit -->
- A way to replace a lost Recovery Key on the same account.
- Travel Rule messaging with other institutions, and an ERC-1271 ownership check.
- The plain-language summary on the Send screen.
- A sponsorship budget and rate limits per wallet.
- A durable, externally anchored audit store, and audits of `SwissquoteAccount`, `lib/wallet/shamir.ts` and the phone SDK.

## AI tools

- **Claude Code (Anthropic), with Claude Opus 5.5.** 49 of the 144 commits up to `fe636f0` carry a `Co-Authored-By: Claude Opus 5.5` trailer. Count them with `git log --grep='Co-Authored-By: Claude' --oneline | wc -l`. Those commits include work on protocol.md and the contracts that enforce it, the 2-of-3 Shamir wallet and the phone SDK, the Wallet API routes and the independent service, the CLI and `npm run local`, the iOS build, the design system, the wiring of the screens to the live wallet, and earlier versions of this README. The `track/*` branches, including this README, the pitch summary and the deck, were written by Claude Code agents working from a shared brief. TODO(team): confirm how the team reviewed the AI-written code before merging.
- **OpenAI Codex.** The original credits name it for research, code and documentation. No commit trailer names it, so the history does not show which parts. TODO(team): confirm what Codex did.
- **Commits without a trailer.** The other 95 commits carry no AI trailer. They include the first screen designs, the compliance engine, the legal briefing, the first wallet backend, the first slides and the pitch summary. TODO(team): confirm which AI tools, if any, helped with them.

## Run it locally

You need Node.js 22.18 or later and [Foundry](https://getfoundry.sh), with `anvil` and `forge` on your PATH. Everything runs offline.

```bash
npm install
npm run local
```

`npm run local` starts a fresh anvil chain, deploys the contracts, starts the independent service and the app, and writes `.env.local`. The first run also installs the contract dependencies. Every run starts from an empty chain and wipes `data/`, CLI accounts included. Open http://localhost:3000/onboarding-welcome when it prints the command list. Ctrl-C stops everything.

The app uses port 3000, anvil 8545 and the independent service 4002. If a port is taken, `npm run local` names the process that holds it and exits. Pick other ports with `PORT`, `RPC_PORT` and `PARTNER_PORT`:

```bash
PORT=3200 RPC_PORT=8546 PARTNER_PORT=4003 npm run local
```

For a public demo behind a tunnel, `npm run local -- --prod` serves a production build and keeps the chain, the share vaults and their keys in `data/` across restarts, so a redeploy keeps every wallet. Delete `data/` for a fresh chain, as after a contract change. Set `PUBLIC_PARTNER_URL` to the independent service's public URL, because the phone posts Share C there directly. The app and the independent service each need a public hostname. Anvil stays private.

Drive the protocol from a second terminal. The commands read `.env.local`, so they follow the ports.

| Command | What it does |
| --- | --- |
| `npm run status` | Shows chain time, the contracts, Swissquote's gas funds, every wallet with its USDC and pending recovery, and the CLI accounts. |
| `npm run fund [wallet] [amount]` | Mints test USDC, 100 by default. `wallet` is an address or an account name. Without it, the newest wallet gets the USDC. |
| `npm run account <name>` | Creates a wallet with a software passkey and funds it with 100 USDC. Saves it in `data/accounts/<name>.json`, with its Recovery Key file next to it. |
| `npm run send <from> <to> <amount>` | Sends USDC from an account to an address or another account. Above 1,000 USDC the payment waits 24 hours of chain time. A refusal prints Swissquote's reasons. <!-- verify: track/stepup --> |
| `npm run recover <account or file> [new-name]` | Starts a recovery onto a new phone with an account's Recovery Key or a Recovery Key file. Saves the new phone as `new-name`, which defaults to `<account>-new`, or `recovered` for a file. |
| `npm run cancel <account>` | Cancels a pending recovery through Swissquote, signed with the Recovery Key. |
| `npm run finish <account>` | Finishes a recovery after the 48-hour delay. |
| `npm run warp [hours]` | Moves chain time ahead, 48 hours by default. |
| `npm run attack <account>` | Plays a thief with the account's phone and email inbox, and prints each refusal. <!-- verify: track/identity --> |
| `npm run sunset` | Takes Swissquote's services away for good, so the independent service opens exit mode after 30 days. <!-- verify: track/exit --> |
| `npm run exit <account> <to> all` | Moves the account's funds out without Swissquote, with Shares A and C, the passkey and its own gas. <!-- verify: track/exit --> |
| `npm run e2e` | Runs the protocol end to end against the running stack. |

`npm run e2e` creates a wallet, sends, gets refused for a sanctioned recipient, loses the phone, cancels recoveries both ways, recovers after the delay and sends from the new phone.

Demos:

- **Fund a browser wallet.** Create a wallet at `/onboarding-welcome`, then run `npm run fund`. Home shows 100 USDC.
- **Make a large payment.** `npm run account anna`, `npm run fund anna 2000`, `npm run send anna 0x000000000000000000000000000000000000dEaD 2000`, then `npm run warp 24`. <!-- verify: track/stepup -->
- **Recover a browser wallet from the terminal.** Save the Recovery Key file during onboarding, then run `npm run recover ~/Downloads/"Swissquote Wallet Recovery Key.txt"`. The browser plays the old phone. Its Home shows "Someone started recovering your wallet" and can cancel it.
- **Recover a CLI wallet in the browser.** Open `/recover` and load `data/accounts/anna Recovery Key.txt`.
- **Skip the delay.** `npm run recover anna`, `npm run warp`, then `npm run finish anna-new`. `anna-new` now sends from the same address with the same funds.

Checks:

```bash
npm run check              # Shamir, onboarding flow and amount unit checks
npm run check:onboarding   # onboarding in Chromium, against the running app
npm run e2e:ui             # create, send, recover, cancel and finish in Chromium, against the running app
npm run contracts:test     # Foundry tests for the account
npm run test:compliance    # compliance engine, tampering, providers, HTTP, audit
npm run typecheck
```

Compliance on its own:

```bash
npm run demo:compliance             # six fixture cases, signed receipts, audit chain
npm run check:compliance-providers  # live TRM and Base Sepolia read-only check; uses TRM quota
```

The six demo cases are a 20 USDC transfer (`ALLOW`), a 2,000 USDC transfer (`STEP_UP`), a finite approval plus vault deposit (`ALLOW`), a sanctioned address, an unlisted contract and an unlimited approval (all `DENY_ASSISTANCE`). The vault address is a fixture, not a deployed contract.

**Base Sepolia.** Copy `.env.example` to `.env.local` and fill it in (`CHAIN=base-sepolia`). Deploy, then copy the printed addresses into `.env.local`:

```bash
cd contracts && forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $SWISSQUOTE_KEY --broadcast
```

Run `npm run partner` and `npm run dev` in two terminals. The CLI commands work there too, except that `npm run fund` prints a faucet link instead of minting and `npm run warp` needs anvil.

**Live compliance.** Set `COMPLIANCE_MODE=live` with `COMPLIANCE_POLICY_FILE` (a reviewed policy JSON), `COMPLIANCE_RPC_URLS` (chain ID to HTTPS RPC), `COMPLIANCE_SIGNING_PRIVATE_KEY` (a persistent Ed25519 PKCS#8 PEM, separate from every wallet key) and `COMPLIANCE_API_KEY`. `TRM_API_KEY` and `COMPLIANCE_AUDIT_FILE` are optional. Restart after any change.

**Pitch deck.** [slides/index.html](slides/index.html) is one HTML file that loads its app screens from `slides/screens/`. Open it in a browser. Arrow keys, Space, a click or a swipe move between slides, F toggles full screen, and printing gives one 16:9 page per slide. With `npm run dev` running, `node slides/capture.ts home onboarding-secure` captures fresh screens.

### Run it on iOS

The iOS app bundles the screens and the phone's code, so Swissquote's server never serves the code that sits next to Share A. The app calls the API at http://localhost:3000, which the iOS Simulator reaches on your Mac. You need Xcode.

Run `npm run local` in one terminal. In a second terminal:

```bash
npm run ios        # static export into out/, copied into ios/
npm run ios:sim    # the same, with a software passkey
npm run ios:open   # opens the project in Xcode
```

In Xcode, pick an iPhone simulator and press Run. With `PORT=3200 npm run local`, build with `NEXT_PUBLIC_API_URL=http://localhost:3200 npm run ios`.

`npm run ios` is the real-passkey build. Real passkeys need an associated domain, and an app on `localhost` cannot have one, so WebKit refuses them. `npm run ios:sim` builds for the simulator with a software passkey kept in the web view's storage instead. It is for the simulator only and must never ship.

## Credits

Built for the BSA hackathon. Claude Code (Anthropic) and OpenAI Codex helped with research, code and documentation. [AI tools](#ai-tools) has the detail.
