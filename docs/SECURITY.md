# Security model

This document covers the custody model, threat model, wallet creation, authentication and recovery. [Shamir key sharing and wallet recovery](SHAMIR_AND_RECOVERY.md) walks through the cryptography and every recovery step. [protocol.md](../protocol.md) is the spec. Where this document disagrees with it, protocol.md wins.

## Custody model

### We chose a smart account that needs two independent keys

The wallet is an ERC-4337 smart account, `SwissquoteAccount`. Every operation needs two signatures, and the account checks both on chain:

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
| MPC, threshold signatures | The parties hold key shares and sign together. The full key never exists in one place. | No single place ever holds the key. The output is an ordinary signature, so it works on Bitcoin too. | Complex protocols that need an audited library and an audited integration. If Swissquote and its partner hold two of three shares, they can sign without the client. The spending rules live in the parties' servers, not on chain. | Not chosen. Two servers that can sign alone is the custody problem we set out to remove. |
| Passkey-only smart account | An ERC-4337 account checks a WebAuthn passkey | No seed phrase. Face ID. Rules enforced on chain. Gas sponsorship. | The passkey is the only factor. Whoever takes over the Apple or Google account that syncs it can spend. Losing it needs a separate recovery scheme. EVM only. | Partly chosen. We keep the account and the passkey, and add a second, independent key. |
| Split backup, Shamir or SLIP-39 | The seed is split into shares held by the user, friends or services. A threshold of shares rebuilds it. | No single backup to lose or steal. An open standard. | Whoever rebuilds the seed holds the whole key and can spend. If services hold enough shares, they can spend. No screening, no delay, no cancel. | Partly chosen. We split the wallet key, but the account also needs the passkey or the Recovery Key, so the shares alone cannot spend. |

Our model is the last two combined. Shamir sharing alone lets two holders spend. A passkey alone has no recovery. Together, two holders who rebuild the key still lack the passkey, and a lost passkey is replaced through the Recovery Key and a delay the client can cancel.

### What our model gets right

- Neither Swissquote nor the independent service can move funds with what they hold, alone or together. Together they can rebuild the wallet key, but the account also needs the passkey for any payment and the Recovery Key to start a recovery.
- There is no seed phrase. Daily use is one Face ID per payment.
- A lost phone is recoverable with the Recovery Key and both share holders, behind a 48-hour on-chain delay the client can cancel. A linked wallet recovers the same way.
- A wallet needs no Swissquote account. Linking one later adds the Travel Rule proof, sponsored gas, the lock and Swissquote's financial services such as Swissquote Plus.
- The address stays the same after recovery, so deposit addresses and allowlists stay valid.
- Swissquote screens every payment and shows the client its reading before Face ID. For a linked wallet it also pays the gas.
- The parts are established open-source code: EntryPoint v0.7 and its sample `VerifyingPaymaster` from eth-infinitism, OpenZeppelin's `WebAuthn` and `ECDSA`, noble-curves, viem and ox.

### What it costs

The phone rebuilds the whole wallet key, so this is not threshold signing. The split is our own code and needs an audit. The account is EVM-only. Swissquote keeps availability powers. While it runs, it can lock a client out without moving their funds. [Known limits](#known-limits) has each of these in detail.

## Threat model

| Who | What they hold | Can they steal? | Can they lock the client out? | What stops them |
| --- | --- | --- | --- | --- |
| Thief with a locked phone | Sealed Share A | No | No. The client recovers with B, C and the Recovery Key. | Share A opens only with the passkey's PRF output, where the authenticator supports PRF. Every operation needs a passkey assertion with Face ID. |
| Thief who can unlock the phone | Share A, the passkey, maybe the cached key | Yes. They can send the whole balance at once, in one payment. Nothing delays or cancels a payment once Face ID approved it. On a linked wallet, until the client reports the phone. An unlinked wallet has no lock, so for as long as they hold the phone. | On a linked wallet, until the report. On an unlinked wallet, for as long as they hold the phone. Either way by cancelling recoveries from the phone. | On a linked wallet, the lock ([A6](#the-attacker-with-the-phone-and-the-email)). Once the client reports the phone, Swissquote refuses its payments, its Share B requests and its cancels of a recovery. The lock cannot stop a key still cached on the phone, for up to 3 hours, paying through a public bundler with the thief's own ETH. On an unlinked wallet nothing at Swissquote stops them, because only a linked wallet has the lock. Such a thief could also link an unlinked wallet to their own Swissquote account. That needs an account in their own name, and Swissquote identified them when they opened it. They can already pay like the owner. |
| Thief with the phone and the email inbox | The locked phone and the client's email | No | No | No Face ID, so no passkey. No email reset exists. The Recovery Key is not on the phone. A Recovery Key the thief made is refused, and without the real one Swissquote and the independent service authorize no recovery (A1 to A4). |
| Thief with the Recovery Key file | The Recovery Key | Only if the client does not cancel within 48 hours. | Yes. They can cancel the client's recoveries through Swissquote. On a linked wallet they can also lock the phone, which the client unlocks with the same key. | The 48-hour delay. The old phone's Home shows the recovery at once, and the client cancels it with Face ID or asks Swissquote to cancel it with the Recovery Key. If the thief also locked the phone, it cannot cancel, so the client cancels through Swissquote with their copy of the key, or unlocks the phone with it first. If the client does not react within 48 hours, the thief gets the wallet, linked or not (A5). Swissquote tells the key's holder nothing about the owner. The key cannot be replaced, so a client whose key was copied should move the funds to a new wallet. |
| Swissquote alone (rogue employee, breached server) | Share B, sponsorship, submission, guardian, the lock | No. One share is not the key, and the account also needs the passkey. | Yes. It can withhold B, refuse to sponsor or submit, lock the phone of a linked wallet and cancel recoveries as guardian. The funds stay in the account. | Nothing while Swissquote runs. [Exit mode](#exit-without-swissquote) covers Swissquote gone, not Swissquote refusing. The [legal section](LEGAL.md#why-this-is-not-custody) proposes contract terms for refusal. |
| Independent service alone | Share C | No | It can refuse C, which blocks recovery and exit. | The threshold. It releases C only for a recovery that Swissquote approved and the bound Recovery Key signed, or in exit mode for an operation the passkey approved. |
| Swissquote and the independent service together | B and C, so the full wallet key | No. Normal mode needs the passkey. Recovery mode needs the Recovery Key and can only call `initiateRecovery`. | Yes, by both refusing. | The account's second signature in each mode. This is the security claim in protocol.md. |
| Swissquote, with a stolen Recovery Key file | B, approval power and the Recovery Key | Yes, after 48 hours, unless the client cancels. Both cancel paths in the app run through Swissquote, so a hostile Swissquote can block the cancel for the whole 48 hours. | Yes | Only the client keeping the Recovery Key file safe. Production should have the independent service alert the client on every release of Share C. |
| Swissquote's server tampering with an operation | The UserOperation it builds | No | No | Before Face ID, the phone checks the sender and the callData, checks that a paymaster, if set, comes with its sponsorship, and recomputes the hash. On a sponsored operation the paymaster, not the client, pays any gas Swissquote sets. On an operation with no paymaster the wallet pays, and the phone works out the most that can cost from the operation's own gas limits and fee and shows it before Face ID. A server that drops a linked wallet's sponsorship can make it pay gas, up to that amount, which the client sees first. |
| Malicious app build | Code next to Share A and the passkey | Yes, in theory | Yes, in theory | Out of scope for the protocol. In the web build, Swissquote's server serves the phone's code, so the web build trusts Swissquote. The iOS build bundles the code. Production needs a native app, reproducible builds and audits. |

Both ways to cancel a recovery run through Swissquote. The old phone's cancel needs Swissquote's sponsorship and, on a cache miss, Share B. A locked phone's cancel is refused, so the client then cancels through Swissquote with the Recovery Key, on `/recover` or with `npm run cancel`.

**Who could steal funds?** Someone who can unlock the client's phone, until the client reports it on a linked wallet, or for as long as they hold it on an unlinked one. They can send the whole balance at once, in one payment, and nothing delays or cancels it. Someone with the Recovery Key file, if the client does not cancel within 48 hours, on any wallet. A malicious app build. No server can, alone or with the other server.

**Who could lock the client out?** Swissquote alone, by withholding Share B or sponsorship, by locking the phone of a linked wallet, or by cancelling recoveries as guardian. The independent service, by refusing Share C, which blocks recovery and exit. A thief with the unlocked phone, by cancelling recoveries until the client reports it, or for as long as they hold the phone of an unlinked wallet. A thief with the Recovery Key file, by cancelling the client's recoveries through Swissquote and, on a linked wallet, by locking the phone until the client unlocks it with the same key. The client, by losing the phone and the Recovery Key together.

**Could Swissquote alone, or with the partner, move the funds without the client?** No. Together they can rebuild the wallet key, but the account also needs the passkey for any payment. Starting a recovery needs the Recovery Key, and a recovery replaces the keys only after 48 hours that the client can cancel. They could take the wallet only with something the client holds: a stolen Recovery Key file, or a malicious app build the client runs.

## Wallet creation

Every key is generated on the client's phone. Swissquote and the independent service each receive one share and check it before storing it.

| Key | Generated | Lives | When it leaves its holder |
| --- | --- | --- | --- |
| Passkey (P-256) | By the phone's authenticator, behind Face ID, at **Create Passkey** | The authenticator, in the phone's secure hardware | Only its public key, which goes into the account's config |
| Wallet key (secp256k1) | On the phone, by `split()` in `lib/wallet/shamir.ts`, from noble-curves' secure random generator | Nowhere at rest. The phone keeps it in memory for up to 3 hours and drops it when the app closes. | Never as a whole. Its shares go to the three holders. |
| Share A | The same split, at x = 1 | The phone's storage, AES-GCM sealed under the passkey's PRF output and bound to the signer address | Never |
| Share B | The same split, at x = 2 | Swissquote's vault | To a phone, for a passkey-approved operation or a Recovery-Key-signed recovery |
| Share C | The same split, at x = 3 | The independent service's vault | To a new phone, for a recovery Swissquote approved and the Recovery Key signed, or in exit mode for a passkey-approved operation |
| Recovery Key (secp256k1) | On the phone, by viem's `generatePrivateKey` | The file `Swissquote Wallet Recovery Key.txt`, which the client keeps off the phone | Only its address and its signatures |

Creation needs no Swissquote account and no sign-in. It runs in this order:

1. The phone creates the passkey.
2. The phone splits a fresh wallet key into Shares A, B and C with Feldman commitments.
3. The phone sends Share B, the commitments and the passkey's public key to `POST /api/shares`. Swissquote checks B against the commitments, stores it and returns a ticket it signed, valid for 5 minutes.
4. The phone sends Share C and the ticket straight to the independent service. The service checks Swissquote's signature, the ticket's expiry and C against the commitments, then stores C.
5. The phone seals Share A under the passkey's PRF output and keeps it.
6. The phone creates the Recovery Key and saves its file. The client confirms **I saved it off this phone**. The wallet key signs a statement naming the Recovery Key's address. Both holders record it once and refuse to rebind it.
7. `POST /api/wallets` checks that binding and registers the wallet. The first operation deploys the account.

Without WebAuthn PRF support, Share A sits unsealed in web storage. The native app would keep it under a Secure Enclave or Keystore key instead.

### Linking a Swissquote account

Linking is optional and comes later, from the app. On an unlinked wallet, Settings shows **Link your Swissquote account**. Its tray says what linking adds and has one button, **Link with Face ID**.

1. The app sends the client to their Swissquote account to sign in, with `POST /api/session`. This is mocked, and Swissquote accepts at once. A phone without a session Swissquote knows becomes a new made-up client. No ID is involved.
2. With Face ID, the wallet's passkey signs keccak256 of "Wallet 0x… belongs to Swissquote client *number*." It is the passkey the account requires for every payment. Nothing goes on chain, no wallet key is rebuilt and Share B stays with Swissquote.
3. `POST /api/wallets/:address/link` checks the session and checks the assertion against the wallet's live passkey, or the one in its config before deployment. It then stores the owner record: client number, time, the statement and the assertion. It answers 401 without a known session and 403 if the wallet's passkey did not sign. A wallet stays with the client who first linked it, and there is no unlink. Linking it again, as from a new phone after a recovery, keeps that client, and the mock signs the phone in as them.

Settings then shows the Swissquote account, marked **Linked**, with the client number. Linking adds four things:

1. **The Travel Rule proof.** Money moves between the client's Swissquote account and the wallet with no extra checks, because the signed statement is Swissquote's ownership proof. An unlinked wallet goes through Swissquote's usual procedure for an external wallet, as for any self-hosted wallet.
2. **Network fees.** Swissquote's paymaster pays the wallet's gas, so the wallet needs no ETH. An unlinked wallet pays its own from its ETH.
3. **The lock.** Swissquote can lock a lost or stolen phone when the Recovery Key asks. Only a linked wallet has it. See [The lock](#the-lock).
4. **Financial services.** The client can use Swissquote's financial services from the wallet, such as Swissquote Plus. Swiss law lets Swissquote offer them only to a client it has identified, and the link says which client owns the wallet.

`GET /api/wallets/:address` returns the owner record only with the owner's own session, so the public wallet names no owner. `npm run status` checks each record's assertion against the passkey the wallet was created with or the one it has now, and shows a wallet with no record as "not linked to a Swissquote client".

A thief who can unlock the phone could link an unlinked wallet to their own Swissquote account. They would need an account in their own name, and Swissquote identified them when they opened it. They could already pay like the owner. The owner could still recover the wallet with the Recovery Key, but could not link it back, because a linked wallet stays with its client.

## Authentication

The client proves who they are with the passkey, behind Face ID, for every operation. The wallet itself uses no password, SMS code or email link, so there is nothing to phish by email.

1. The phone builds the call and asks Swissquote to prepare it.
2. Swissquote runs compliance and returns a UserOperation with its plain-language summary. It sponsors the operation if the wallet is linked.
3. The phone checks the sender and the callData, checks that a paymaster, if set, comes with its sponsorship, and recomputes the hash. If the operation has no paymaster, the wallet pays the gas, and the phone works out the most that can cost and shows it as the network fee. It shows Swissquote's summary under **Checked by Swissquote**.
4. Face ID unlocks the passkey, which signs that exact hash.
5. If the wallet key is not cached, the same assertion fetches Share B. Swissquote checks it against the wallet's passkey and the prepared operation first.
6. The phone rebuilds the key from A and B, signs the same hash and sends both signatures to Swissquote, which submits them.
7. The account checks the wallet key's signature and the WebAuthn assertion on chain.

The account's check, OpenZeppelin's `WebAuthn.verify`, requires the authenticator's user-verified flag. A passkey prompt that skipped Face ID or the device passcode fails on chain. Swissquote's API checks the same flag before it releases Share B.

The binding to the device comes from Share A. Platform passkeys can sync through iCloud Keychain or Google Password Manager, but Share A never leaves the phone. A synced copy of the passkey on another device gets at most one share, because the independent service releases C only for a recovery or in exit mode. A cached key skips fetching Share B. It never skips Face ID.

Every payment takes one Face ID and leaves at once, whatever the amount. There is no cap on how much the client sends, in one payment or in a day. Nothing delays a payment once Face ID approved it, and nobody can cancel it. The account itself enforces only the signatures.

## Recovery

| What happened | Who is involved | How long | What stops an attacker |
| --- | --- | --- | --- |
| Phone lost or destroyed | The client with a new phone and the Recovery Key file, whether the wallet is linked or not. Swissquote releases Share B, and the independent service releases Share C. | A few minutes of setup, then 48 hours of chain time | The Recovery Key must sign the exact recovery. The old phone shows the pending recovery and can cancel it, and Swissquote cancels it when the Recovery Key asks. |
| Phone stolen and locked | The same as a lost phone | The same | The thief cannot open Share A or make a passkey assertion, so they can neither pay nor cancel the recovery. |
| Phone stolen and unlocked | The same, plus the lock on a linked wallet | The same | On a linked wallet, the client locks the old phone with the Recovery Key, from **Lock your old phone** on the new phone's countdown or through Swissquote (`npm run lock`). An unlinked wallet has no lock. See the [threat model](#threat-model). |
| Recovery Key lost, phone fine | The client | Minutes | The account cannot change its Recovery Key. The client moves the funds to a new wallet. The app holds one wallet per phone, so in this build the new wallet needs a second phone or browser profile. |
| Phone and Recovery Key both lost | Nobody can help | Never | No one can replace the keys without the Recovery Key. This is the cost of Swissquote having no power to move funds. |
| Independent service gone | The client and Swissquote | Payments: no change. Recovery: blocked until C is available. | Payments use A and B and keep working. A lost phone cannot be recovered without C. Production: the service's contract names a successor that takes over its vault. |
| Swissquote gone | The client and the independent service | 30 days after Swissquote's services stop, then minutes | [Exit without Swissquote](#exit-without-swissquote). |

A recovery runs like this:

1. The new phone loads the Recovery Key and signs a timestamped lookup. `GET /api/recovery` returns the wallet's address, any pending recovery and whether it is linked to a Swissquote client, and nothing about that client.
2. The new phone creates a new passkey and a new wallet key, split into new shares A', B' and C'. The new key binds itself to the same Recovery Key at both holders.
3. `POST /api/recovery` prepares `initiateRecovery(newSigner, newPasskey)`. Swissquote sponsors the recovery for every wallet, linked or not, so a wallet with no ETH can still be recovered. The phone checks the operation and recomputes its hash.
4. The Recovery Key signs the operation hash. Swissquote checks that signature against the Recovery Key bound to the old key, releases the old Share B and signs a recovery approval that expires after 5 minutes.
5. The independent service checks the approval, recomputes the hash, checks the call is `initiateRecovery` and checks the Recovery Key's signature. Then it releases the old Share C.
6. The new phone rebuilds the old key from B and C, signs once and submits in recovery mode. The account records the new key and passkey and sets `executeAfter` to now plus 48 hours.
7. During the delay, the old phone can cancel, or Swissquote cancels as guardian when the Recovery Key asks. After it, anyone can call `finalizeRecovery`, which installs the recorded key and passkey. The address, the funds and the Recovery Key stay the same.

A linked wallet recovers exactly like an unlinked one, and no step checks the client's ID. The recovery does not sign the new phone in to Swissquote. The wallet stays linked, so Swissquote still pays its network fees. To use the Swissquote account from the new phone, the client links again from Settings.

During the delay the old keys still work. Recovery is not a freeze, which is why the lock exists. A lock applies only while the wallet's live key and passkey are the locked ones, so a finished recovery ends it without an unlock.

### The lock

Recovery is not a freeze. During the 48-hour delay the old keys still work, so a thief who can unlock the old phone could keep paying. The lock stops that at Swissquote.

- The client reports the phone with **Lock your old phone** on the new phone's countdown, or through Swissquote (`npm run lock`). The Recovery Key signs the request, and Swissquote checks that signature before it locks the phone's credentials. `npm run unlock` unlocks them, also signed by the Recovery Key. Both run through `POST` and `DELETE /api/wallets/:address/lock`.
- Only a linked wallet can be locked. The lock is part of what linking adds. On an unlinked wallet the countdown offers no lock, the API answers 403, and `npm run lock` and `npm run unlock` refuse.
- Once the phone is locked, Swissquote refuses its payments, its Share B requests and its cancels of a recovery, each with 423 "Swissquote locked this phone after it was reported lost."
- A locked phone's cancel of a recovery is refused, so the client cancels through Swissquote with the Recovery Key, on `/recover` or with `npm run cancel`.
- A lock applies only while the wallet's live key and passkey are the locked ones, so a finished recovery ends it without an unlock.
- Whoever holds the Recovery Key can lock and unlock. A thief with a copy of it can lock the owner's phone, and the owner unlocks it with the same key. The thief can lock it again, so the owner should then move the funds to a new wallet, because the Recovery Key cannot be replaced.
- The lock is Swissquote's, not the chain's. It cannot stop a key still cached on the stolen phone, for up to 3 hours, from signing an operation the thief submits through a public bundler with their own ETH.

### Exit without Swissquote

If Swissquote's services are gone, the independent service lets the client move funds out with Shares A and C.

- The service opens exit mode once Swissquote has been unreachable or closed for `EXIT_AFTER`. That is 30 days by default, for production. `npm run local` sets 5 seconds, and `npm run local -- --prod` sets 600 seconds. The `EXIT_AFTER` environment variable overrides both.
- The service calls Swissquote's `GET /api/config` every fifth of `EXIT_AFTER`, at least once an hour, and on each exit request. One answer resets the clock. It keeps the last answer's time in its database, so a restart does not reset it.
- `POST /exit` releases Share C only in exit mode, only for an `execute` operation with no paymaster, and only with a passkey assertion that verifies against the account's current passkey. That passkey is on chain or, for an undeployed wallet, in the deployment config the operation carries.
- The exit needs the phone, with Share A and the passkey (one Face ID), a connection to the chain, and ETH in the wallet for gas. The phone rebuilds the key from A and C and the operation goes straight to the EntryPoint through any public bundler. `npm run exit` sends the wallet 0.01 ETH when it holds less than 0.005 ETH, and anvil's second account plays the bundler. An undeployed wallet is deployed by its exit.
- In this build the exit runs from the terminal only (`npm run exit`). The app has no exit screen.
- `npm run sunset` simulates the outage. Every `/api` route then answers 503 "Swissquote's services are closed." `npm run sunset off` runs them again, and `npm run local` clears it on start.

Exit mode does not cover a phone lost while Swissquote is gone. The production answer is for Swissquote's resolution plan to escrow Share B with the independent service or an escrow agent. That is safe because B and C together cannot move funds without the passkey or the Recovery Key, and a recovery on chain needs no Swissquote signature. Anyone can finalize, and the guardian can only cancel. The service's recovery rule would need an exit-mode variant. The passkey works only on Swissquote's domain, so the wind-down plan must also keep that domain serving the app.

### The attacker with the phone and the email

`npm run attack <account>` plays a thief who stole the client's phone and has their email inbox. It tries every way in, prints who refused each attempt and why, and asserts it. It works on a linked and an unlinked wallet and ends "Every attempt on *account*'s wallet failed." `npm run e2e` runs it.

On a linked wallet it runs A1 to A6:

1. **A1. Pay from the phone without Face ID.** Share A stays sealed. The thief's own passkey cannot open it. Swissquote refuses Share B, and the account would reject the operation (AA24).
2. **A2. "Forgot my keys" with the email inbox.** No email reset exists. A recovery needs the Recovery Key's signature.
3. **A3. Recover with a Recovery Key the thief made.** No wallet uses it. Both share holders refuse to bind it, and the account would reject it (AA24).
4. **A4. Recover without the Recovery Key, naming the owner's by its address.** Swissquote and the independent service refuse to authorize the recovery.
5. **A5. The real Recovery Key, copied from the owner's home.** Swissquote finds the wallet but tells the thief nothing about the owner. The recovery waits 48 hours in public, finishing early fails, and the owner cancels it through Swissquote with the Recovery Key.
6. **A6. A thief who can unlock the phone.** Face ID passes, so the phone pays like the owner's. It can send the whole balance at once, in one payment. The owner reports it, and Swissquote locks it. Swissquote then refuses the phone's payment, its Share B request and its cancel of the owner's recovery, each with 423 "Swissquote locked this phone after it was reported lost."

On an unlinked wallet, A1 to A5 run the same. A6 does not run, because only a linked wallet can be locked.

## Known limits

- **The key split is our own code.** `lib/wallet/shamir.ts` is 53 lines, about 30 of them logic, on @noble/curves' field and point arithmetic, with Feldman commitments that each holder checks. It needs an audit, or a swap for an audited library, before launch.
- **The phone rebuilds the key.** This is Shamir sharing, not threshold signing. The full wallet key exists on the phone at creation, on each cache miss and at recovery, and stays in memory for up to 3 hours. The phone receives Share B on a cache miss, for an operation its passkey approved. It receives Share C only at recovery (Swissquote approved, Recovery Key signed) or at exit (passkey approved). Each holder checks its own rule first. A compromised phone app sees the key, which still moves nothing without the passkey.
- **It is EVM-only.** The passkey and recovery rules live in an EVM contract. Bitcoin script cannot verify a P-256 passkey or hold a cancellable recovery. A Bitcoin path would need a Taproot policy whose recovery branch opens only after a relative timelock (`OP_CHECKSEQUENCEVERIFY`).
- **Nothing delays or cancels a payment.** Once Face ID approves a payment, it leaves at once, whatever the amount. A thief who can unlock the phone can send the whole balance in one payment before the client reports the phone. The lock stops only what comes after the report.
- **The lock is Swissquote's, not the chain's.** It cannot stop a key still cached on the stolen phone, for up to 3 hours, from signing an operation the thief submits through a public bundler with their own ETH.
- **An unlinked wallet has no lock.** A thief who can unlock the phone can send the whole balance at once and cancel the client's recoveries for as long as they hold it.
- **The Recovery Key alone starts a recovery.** Linked or not, no ID check backs it up. A stolen Recovery Key gets the wallet if the client does not cancel within 48 hours. On a linked wallet it can also lock the phone, which the client unlocks with the same key.
- **A link cannot be undone.** There is no unlink, and a wallet linked to one client cannot be linked to another. A thief who can unlock the phone can link an unlinked wallet to their own Swissquote account, which names them. The owner can still recover the wallet but cannot link it back.
- **A phone lost while Swissquote is gone is not covered.** Exit mode needs Share A. The production answer is in [Exit without Swissquote](#exit-without-swissquote).
- **Swissquote keeps availability powers.** While it runs, it can lock a client out without moving funds. Exit mode covers Swissquote gone, not Swissquote refusing.
- **Recovery needs both share holders.** If the independent service is gone when the phone is lost, the funds stay locked until it returns.
- **The Recovery Key cannot be replaced.** The account has no function to change it. A client who loses it moves the funds to a new wallet.
- **Not built.** Alerts on every channel when a recovery starts (only the old phone's Home, and `/recover` once the Recovery Key is loaded, show it). Signing the ownership statement again after a recovery (the owner record keeps the assertion of the passkey that linked the wallet, and `npm run status` checks it only against the wallet's first and current passkeys). An exit screen in the app. Travel Rule messaging and an ERC-1271 ownership check. A gas price cap and monitoring of the paymaster deposit. A durable, externally anchored audit store. Audits of `SwissquoteAccount`, `lib/wallet/shamir.ts` and the phone SDK.
