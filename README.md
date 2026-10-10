# Fuse

Fuse is a self-custody crypto wallet that Swissquote could offer its clients. The client holds the keys. Swissquote screens each payment, pays the network fee and helps recover a lost phone. Swissquote cannot move the client's funds, alone or together with the independent service that holds the third key share.

This is a hackathon build. The whole protocol runs on a local chain: the smart account, the key split, the passkey checks, the compliance policy, gas sponsorship and the 48-hour recovery. The parts that need a real bank, such as the ID check and the HSMs, are mocked. [What is mocked](#what-is-mocked-and-the-production-path) lists them.

## Why

Self-custody asks clients to become security experts. A lost seed phrase loses the funds, and one photo of it gives them away. A signing prompt tells the client little about what they approve.

A Swissquote client who wants their own keys today must whitelist an address, prove they own it and pay USD 10 (native coin) or USD 15 (ERC-20 token) per withdrawal ([pricing](https://www.swissquote.com/en-ch/private/trade/pricing/cryptocurrencies), [external wallets](https://www.swissquote.com/en-ch/private/help/trade/products/crypto-asset-products)). After that, Swissquote no longer sees those assets. With 1.22 million accounts and CHF 96.3 billion in client assets ([H1 2026 results](https://www.swissquote.com/en/api/internal/media/get-media?filename=press-releases%2Fad+hoc_EN_Media_Release_H1_2026.pdf)), every client who leaves for a separate wallet takes future trading with them.

Fuse keeps self-custody one tap from the Swissquote account. The client keeps the authority to move funds. Swissquote adds checks before each payment and a recovery path after a lost phone.

## The protocol

[protocol.md](protocol.md) is the spec. Where code or this README disagree with it, protocol.md wins.

[Pitch summary](PITCH_SUMMARY.md) explains the product, the Shamir model, and lost-phone recovery for a pitch audience. [Shamir key sharing and wallet recovery](docs/SHAMIR_AND_RECOVERY.md) contains the detailed technical explanation.

The wallet key is a secp256k1 key split 2-of-3 with Shamir secret sharing. Share A lives on the phone, Share B with Swissquote and Share C with an independent third-party service. Any two shares rebuild the key, but the key alone moves nothing. The ERC-4337 account also requires an assertion from the user's passkey, stored on the phone, over every operation. The phone caches the rebuilt key in memory for at most three hours and drops it when the app closes. When the phone is lost, Swissquote and the independent service release B and C to the new phone, which rebuilds the old key for one signature. The user adds a signature from the Recovery Key kept at home. The account then starts a mandatory 48-hour delay, during which the user can cancel from the old phone or through Swissquote. After the delay anyone can finalize, and the account swaps in the new key and passkey with the same address and funds. Swissquote and the independent service together hold the key but not the passkey or the Recovery Key, so even colluding they cannot move funds.

## How it is built

**Smart account** (`contracts/`, Foundry). `SwissquoteAccount` runs on EntryPoint v0.7. Its config holds the wallet key's address, the passkey's P-256 public key, the Recovery Key's address and Swissquote as guardian.

- Normal mode needs a wallet-key ECDSA signature and a WebAuthn assertion, both over the userOpHash. It cannot call `initiateRecovery`.
- Recovery mode needs the wallet key and the Recovery Key. It can only call `initiateRecovery`.
- `RECOVERY_DELAY` is a constant 48 hours. `cancelRecovery` accepts the guardian or the account itself (the phone, with passkey and key). `finalizeRecovery` is open to anyone after the delay.
- `SwissquoteAccountFactory` deploys CREATE2 clones, so the address is known before deployment.
- Swissquote's `VerifyingPaymaster` (the eth-infinitism sample) pays gas.
- `script/Deploy.s.sol` deploys the factory and the funded paymaster. On a local chain (31337) it also deploys an EntryPoint and a mintable test USDC.

**Key split** (`lib/wallet/shamir.ts`). Shamir over the secp256k1 group order, with Feldman commitments. Each holder verifies its share against the commitments before storing it.

**Phone SDK** (`lib/wallet/phone.ts`). Keeps Share A sealed with AES-GCM under the passkey's WebAuthn PRF output, so only Face ID opens it. Builds every call itself. Before Face ID, it checks Swissquote's UserOperation (sender, callData, sponsorship) and recomputes its hash. On a cache miss, the same Face ID assertion fetches Share B. At onboarding it sends Share C straight to the independent service at a URL pinned in the app build (`NEXT_PUBLIC_PARTNER_URL`), so Swissquote never sees C.

**Swissquote Wallet API** (`app/api`, Next.js route handlers). Session-free, with no Swissquote sign-in. Holds Share B in SQLite, sealed with AES-GCM. It runs the compliance check, signs sponsorship and submits operations to the EntryPoint itself, with no external bundler.

- `POST /api/shares` stores Share B and gives the phone a signed ticket for the independent service.
- `POST /api/wallets` registers a wallet. The wallet key must sign the Recovery Key binding.
- `GET /api/wallets/:address` reads a wallet. `GET /api/config` returns the chain ID and the EntryPoint and USDC addresses.
- `POST /api/wallets/:address/operations` runs compliance and sponsorship for a call.
- `POST /api/wallets/:address/share` releases Share B for a passkey-approved operation.
- `POST /api/wallets/:address/operations/:hash` submits the signed operation.
- `POST /api/recovery` runs the mocked ID check and prepares `initiateRecovery`.
- `POST`, `DELETE` and `PATCH /api/wallets/:address/recovery` release B for a Recovery-Key-signed recovery, cancel as guardian when the Recovery Key asks, and finalize.

**Independent service** (`services/partner/server.ts`). Its own process and database. It stores Share C only for a key Swissquote ticketed, learns the Recovery Key only from a wallet-key signature, and releases C only for an `initiateRecovery` that Swissquote approved and the bound Recovery Key signed. It never takes part in a normal payment. At recovery only the new phone holds B and C together, for one signature.

**Compliance** (`lib/compliance`, `services/compliance`, `app/api/compliance`). The policy engine that decides whether Swissquote assists. See [Compliance](#compliance).

**App** (Next.js 16).

- Create: `/onboarding-welcome`, then `/onboarding-secure`. Creates the passkey, splits the wallet key, saves the Recovery Key file and registers the wallet.
- Home: the real address and USDC balance. On the old phone, a pending recovery shows an alert with Cancel.
- Send: `/choose-recipient`, `/send-hide-my-wallet`, `/transaction-tracking`.
- Recover: `/pending-verification`. Loads the Recovery Key file, runs the mocked ID check, creates a new passkey and split, then shows the 48-hour countdown with Finish and Cancel.

## Threat model

| Who | What they hold | Can they steal? | Can they block the user? | What stops them |
| --- | --- | --- | --- | --- |
| Thief with a locked phone | Sealed Share A | No | No. The user recovers with B, C and the Recovery Key | Share A opens only with the passkey's PRF output. Every operation needs a passkey assertion. |
| Thief who can unlock the phone | Share A, the passkey, maybe the cached key | Yes, payments the compliance policy allows, until recovery finalizes | Yes. They can cancel recoveries from the phone during the delay | Only the policy limits. This is the main residual risk. |
| Swissquote alone (rogue employee, breached server) | Share B, sponsorship, submission | No. One share is not the key, and the account also needs the passkey | Yes. It can withhold B, refuse to sponsor or submit, and cancel recoveries as guardian. Funds stay in the account | Threshold and the on-chain passkey check. Share C goes from the phone to the independent service directly. |
| Independent service alone | Share C | No | It can refuse C, which blocks recovery | Threshold. It releases C only for a Swissquote-approved recovery signed by the bound Recovery Key. |
| Swissquote and the independent service colluding | B and C, so the full wallet key | No. Normal mode needs the passkey. Recovery mode needs the Recovery Key and can only call `initiateRecovery` | Yes, by both refusing | The account's second factor in each mode. This is the security claim in protocol.md. |
| Thief with the Recovery Key file | The Recovery Key | No, unless Swissquote approves a recovery and the user misses 48 hours of it | No | Swissquote's ID check (mocked), Share C's release rule, the 48-hour delay and cancel from the phone. |
| Swissquote's server tampering with an operation | The UserOperation it builds | No | No | The phone checks sender, callData and sponsorship, and recomputes the hash before Face ID. |
| Malicious app build | Code next to Share A and the passkey | Yes, in theory | Yes, in theory | Out of scope for the protocol. Production needs a native app, reproducible builds and audits. |

Refusing assistance never freezes the account on-chain. It does, in this build, stop the user from transacting once the key cache expires, because Share B and sponsorship both come from Swissquote.

## Compliance

### What the wallet enforces

Every payment Swissquote sponsors goes through the compliance engine in-process. Only `ALLOW` is sponsored. `STEP_UP`, `REVIEW` and `DENY_ASSISTANCE` are refused with the reasons shown to the user. There is no step-up factor in this build, so a payment that needs one is refused. A refusal stops Swissquote's assistance. It never freezes the wallet.

The engine runs, in order:

1. Decode the calldata. Only reviewed functions pass: ERC-20 `transfer` and finite `approve`, ERC-4626 `deposit`, `withdraw` and `redeem`, and batches of up to 16 calls.
2. Allowlist and limits. The contract, function and token must be in the policy. Limits are integer token base units, never floating-point or CHF estimates. The local policy (written by `npm run local`) allows USDC `transfer`, with step-up above 1,000 USDC, a 5,000 USDC daily limit and a 10,000 USDC cap per transaction.
3. Sanctions screening. TRM Labs' address sanctions endpoint in live mode, fixtures in demo mode.
4. Simulation. viem's `simulateCalls` over `eth_simulateV1`, from the account's address, in live mode.
5. A signed, expiring Ed25519 decision, appended to a SHA-256 hash-chained audit log. A failed append blocks the decision.

It refuses unlisted contracts and functions, unknown calldata, unlimited approvals, `setApprovalForAll`, delegatecalls, account administration and unsupported chains. Outages and missing evidence never fall back to `ALLOW`. The wallet API separately refuses any call to the account itself except `cancelRecovery`.

The engine also has a standalone HTTP API for other backends: `POST /api/compliance/evaluate`, `GET /api/compliance/keys` and `GET /api/compliance/registry`. Each call needs `Authorization: Bearer <COMPLIANCE_API_KEY>` and an `X-Compliance-Subject` header set by the trusted bank backend. Never ship the key to a browser.

Known limits:

- Live mode has no bank usage ledger yet. Operations under a daily cap return `REVIEW` until one is connected with atomic spending reservations.
- The audit file is single-process. A local hash chain cannot prove completeness or stop an operator rewriting history. Production needs shared, durable, externally anchored storage.
- A TRM `CLEAR` means no match in that response. It is not SECO coverage, KYT or Travel Rule clearance.
- Simulation is predictive. It is not proof against malicious tokens or state changes before inclusion.

### Regulatory position

Research checked on 10 October 2026, against Swiss law including the 1 October 2026 AMLA and AMLO amendments ([FINMA notice](https://www.finma.ch/en/documentation/dossier/dossier-geldwaeschereibekaempfung/hinweise-zur-revision-des-geldwaeschereigesetzes-und-der-geldwaeschereiverordnung/)). This is engineering research, not legal advice or FINMA approval.

The defensible proposition is client-controlled assets with regulated bank assistance.

- **Custody is conditional.** Swissquote cannot move funds, alone or with the independent service. That supports a non-custodial argument but does not settle it. Crypto custody under the Banking Act turns on an undertaking to keep assets available for the client and allocated to them ([BankA Art. 16 no. 1bis and Art. 37d](https://www.fedlex.admin.ch/eli/cc/51/117_121_129/de), [FINMA Guidance 01/2026](https://www.finma.ch/en/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20260112-finma-aufsichtsmitteilung-01-2026.pdf)). Counsel must weigh Swissquote's practical powers in this design: it can withhold Share B and cancel recoveries as guardian. The licensing reform consulted on from October 2025 is not a launch permission ([SIF consultation](https://www.sif.admin.ch/en/newnsb/x4TMWQ1SWofNoFx7XyHhY)).
- **AML applies to the assistance.** AMLO Art. 4(1)(b) covers helping transfer virtual currencies to third parties in a continuing relationship, even without power of disposal ([AMLO](https://www.fedlex.admin.ch/eli/cc/2015/791/de), [2021 explanatory report, section 5.7](https://www.newsd.admin.ch/newsd/message/attachments/67150.pdf)). Swissquote is a bank and already under AMLA, which now expressly covers Embargo Act breaches ([AMLA](https://www.fedlex.admin.ch/eli/cc/1998/892_892_892/de)). The policy engine supplies technical controls. KYC, monitoring, MROS reporting and case management stay in bank processes. The independent service holds a usable share, so its AML and outsourcing role needs its own review ([FINMA outsourcing](https://www.finma.ch/en/news/2017/12/20171205-mm-rs-outsourcing/)).
- **Travel Rule.** Payment orders carry originator and beneficiary data ([AMLO-FINMA Art. 10](https://www.fedlex.admin.ch/eli/cc/2015/390/de)). FINMA applies this to crypto with no self-hosted-wallet exemption, and transfers to a client's own wallet need ownership proven by suitable technical means ([FINMA Guidance 02/2019](https://www.finma.ch/en/~/media/finma/dokumente/dokumentencenter/myfinma/4dokumentation/finma-aufsichtsmitteilungen/20190826-finma-aufsichtsmitteilung-02-2019.pdf)). FINMA has described suitable methods, including a message to the blockchain within a set time and time-boxed transfers ([2020 annual report, pp. 43 to 44](https://www.finma.ch/~/media/finma/dokumente/dokumentencenter/myfinma/finma-publikationen/geschaeftsbericht/20200325-finma-jahresbericht-2020.pdf), [AML supervision 2022](https://www.finma.ch/en/documentation/dossier/dossier-geldwaeschereibekaempfung/geldwaeschereiaufsicht-2022/)). Swissquote taking part in wallet creation is useful evidence, not automatic acceptance. A production proof should verify the account itself through [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) with a fresh single-use challenge, since [EIP-712](https://eips.ethereum.org/EIPS/eip-712) gives no replay protection by itself. Whether Swissquote is the sending institution when it sponsors a payment to an exchange is unresolved. This build exchanges no Travel Rule messages.
- **Sanctions.** Swiss sanctions follow SECO ordinances, which can target people, ownership, geography and services, not just addresses ([SECO](https://www.seco.admin.ch/de/sanktionen), [FINMA notice of 20 August 2026](https://www.finma.ch/en/news/2026/08/20260820-sr/)). Refusing sponsorship stops Swissquote's help. Counsel decides the lawful response to an actual order.
- **dApps and tokens.** An allowlist entry is not an exemption. Token function decides FinSA and CISA scope, and an ERC-4626 vault is not a fund exemption ([FINMA token guidance](https://www.finma.ch/en/news/2018/02/20180216-mm-ico-wegleitung/), [FinSA](https://www.fedlex.admin.ch/eli/cc/2019/758/en), [CISA](https://www.fedlex.admin.ch/eli/cc/2006/822/de)).
- **Recovery and resilience.** The 48-hour delay is a design choice, not a statutory period. A mocked ID check proves the flow, not identity assurance. Production recovery falls under FINMA's operational-risk and fraud expectations ([Circular 2023/1](https://www.finma.ch/~/media/finma/dokumente/dokumentencenter/myfinma/rundschreiben/finma-rs-2023-01-20221207.pdf?sc_lang=en), [digital-fraud guidance](https://www.finma.ch/en/news/2026/04/20260409-mm-am-02-2026-digitale-betrugsrisiken/)).
- **Privacy and records.** Wallet data can be personal data and biometrics are sensitive ([FADP](https://www.fedlex.admin.ch/eli/cc/2022/491/en)). Showing one client that another banks with Swissquote would touch banking secrecy (BankA Art. 47). AML records are kept at least ten years after the relationship or transaction ends ([AMLA Art. 7](https://www.fedlex.admin.ch/eli/cc/1998/892_892_892/de)).
- **EU.** MiCA's exclusion covers pure non-custodial wallet software, not every bank service reached through one ([MiCA recitals 22 and 83](https://eur-lex.europa.eu/eli/reg/2023/1114/oj/eng)). The Transfer of Funds Regulation requires an ownership assessment for self-hosted transfers above EUR 1,000, which is not a general exemption below it ([Regulation 2023/1113](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1113)). Swissquote's MiCA authorisation sits with Swissquote Bank Europe SA ([AMF register](https://www.amf-france.org/fr/espace-epargnants/proteger-son-epargne/listes-blanches/psca/swissquote-bank-europe-sa)) and needs per-feature checks.

Staking, loans, cards and wealth services are out of scope and need their own assessments.

Questions for counsel before a real launch:

- Do Swissquote's powers here (withholding Share B, guardian cancel, sponsorship) amount to custody in any phase?
- What permissions, supervision and contracts does the independent service need?
- Is the ownership proof acceptable before deployment and after recovery swaps the key?
- What institution role applies to each sponsored transfer, and which third-party-wallet flows are allowed?
- Which sanctions lists, service restrictions and reporting procedures apply?

## Run it locally

Free and offline. You need Node.js 22.18 or later and [Foundry](https://getfoundry.sh) (`forge`, `anvil`).

```bash
npm install
cd contracts && forge soldeer install && cd ..
npm run local
```

`npm run local` starts anvil, deploys the contracts, starts the independent service and the app, and writes `.env.local`. Open http://localhost:3000/onboarding-welcome. Use `PORT=3200 npm run local` for another port.

With the stack running, in a second terminal:

```bash
npm run e2e    # the whole protocol in about 3 seconds
npm run warp   # move the chain 48 hours ahead to finalize a recovery
```

`npm run e2e` creates a wallet, sends, gets refused for a sanctioned recipient and a step-up amount, loses the phone, cancels recoveries both ways, recovers after the delay and sends from the new phone.

Checks:

```bash
npm run check              # Shamir, onboarding flow and amount unit checks
npm run check:onboarding   # onboarding in Chromium, against the running app
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

Run `npm run partner` and `npm run dev` in two terminals.

**Live compliance.** Set `COMPLIANCE_MODE=live` with `COMPLIANCE_POLICY_FILE` (a reviewed policy JSON), `COMPLIANCE_RPC_URLS` (chain ID to HTTPS RPC), `COMPLIANCE_SIGNING_PRIVATE_KEY` (a persistent Ed25519 PKCS#8 PEM, separate from every wallet key) and `COMPLIANCE_API_KEY`. `TRM_API_KEY` and `COMPLIANCE_AUDIT_FILE` are optional. Restart after any change.

**Pitch deck.** [public/pitch.html](public/pitch.html) is one self-contained file. Open it in a browser, or visit http://localhost:3000/pitch.html while the app runs. Arrow keys move between slides, N shows speaker notes, O opens the slide picker and P prints to PDF.

## What is mocked and the production path

Real in this build: the Shamir split with verified shares, passkeys verified on-chain, the ERC-4337 account and factory, Swissquote's paymaster, the 48-hour on-chain delay, the independent service as a separate process with its own storage, and the compliance engine.

| Mocked here | Production |
| --- | --- |
| ID document and liveness check during recovery (`POST /api/recovery` accepts any non-empty document and selfie) | A real identity provider matched to the KYC record |
| HSMs. Shares B and C are AES-GCM sealed in SQLite | HSMs at Swissquote and at the independent service |
| Share A and the key cache live in a web app. Without PRF, Share A sits unsealed in web storage | The Swissquote iOS and Android apps, with Secure Enclave or Keystore |
| No Swissquote sign-in or account link | The wallet inside the authenticated Swissquote app |
| Fixture sanctions and simulation in demo mode | Live mode with contracted list coverage and a bank usage ledger |
| The independent service is a process, not a company | A separate, supervised company under contract |
| Local anvil chain | Base Sepolia, then Base mainnet |

Not built yet:

- A lock for a reported phone. Swissquote would refuse Share B, sponsorship and submission for it.
- An exit without Swissquote. Shares A and C plus the passkey can sign in principle, paying gas directly, but the independent service does not release C for that.
- Alerts on every channel when a recovery starts.
- Travel Rule messaging and an ownership proof for other institutions.
- A durable, externally anchored audit store, and audits of `SwissquoteAccount` and the phone SDK.

## Credits

Built for the BSA hackathon. Claude Code (Anthropic) and OpenAI Codex helped with research, code and documentation.
