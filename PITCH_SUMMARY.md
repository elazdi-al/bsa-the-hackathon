# Swissquote Wallet pitch summary

## The pitch

Swissquote Wallet is a self-custody wallet that Swissquote could offer its clients. Payments are approved with Face ID, Swissquote pays the network fees, and a lost phone can be recovered. The client keeps the authority to move funds. Swissquote checks each payment and helps with recovery.

The promise is a wallet as easy as a banking app, with a way back after a lost phone, and no power for the bank to spend your funds.

## The problem

Self-custody puts a hard burden on ordinary clients. They must protect signing keys, understand transaction prompts, pay blockchain fees and plan for losing their phone. A lost key can mean losing the funds for good. A stolen key can empty the wallet.

A Swissquote client who wants their own keys today withdraws to an external wallet. They pay USD 10 or 15 per withdrawal, and Swissquote no longer sees those assets. Swissquote Wallet gives them a better option, one tap from their Swissquote account.

## How Swissquote Wallet works

The client creates the wallet in the app, with no Swissquote account needed. The phone creates a passkey behind Face ID and a separate Recovery Key, which the client saves as a file and keeps at home. Each payment needs the passkey. Before Face ID, the client reads Swissquote's check of the payment in plain words, such as "Send 20 USDC to 0x1bA5...Cf4c." Swissquote screens the payment and pays its fee through its paymaster, so the client never needs a separate gas token.

Behind the interface, Swissquote Wallet uses an ERC-4337 smart account and 2-of-3 Shamir secret sharing. The phone splits the wallet key into three shares:

| Share | Holder | Role |
| --- | --- | --- |
| A | The client's phone | Takes part in every normal payment |
| B | Swissquote | Helps the phone sign, and helps recover |
| C | An independent service | Helps recover a lost phone, and helps the client leave if Swissquote is gone |

Any two shares rebuild the wallet key. One share alone cannot. Each holder checks its share against cryptographic commitments before storing it, and the phone checks that a rebuilt key matches the wallet's signer.

For a normal payment, the phone rebuilds the wallet key from A and B. It keeps the key in memory for up to 3 hours so it does not rebuild it for every payment. Every payment still needs a fresh Face ID approval, and the smart account checks both the wallet key's signature and the passkey's.

This is the central protection. Even if Swissquote and the independent service combine B and C, the wallet key alone cannot make a payment. They still lack the client's passkey. Starting a recovery needs the separate Recovery Key kept at home.

The prototype rebuilds the complete key on the phone and then signs. It uses Shamir sharing, not a threshold signing protocol where the complete key never exists on one device.

## Linking a Swissquote account

Later, the client can link the wallet to their Swissquote account from Settings, with one Face ID. The passkey, which the account requires for every payment, signs that the wallet belongs to their client number, and Swissquote keeps that signed statement. Linking adds three things:

1. Money moves between the Swissquote account and the wallet with no extra checks. The signed statement is the ownership proof the Travel Rule asks for. An unlinked wallet goes through Swissquote's usual procedure for an external wallet.
2. Before anyone recovers the wallet, Swissquote also checks the client's ID.
3. Swissquote can lock a lost or stolen phone.

## Small and large payments

A payment up to 1,000 USDC goes with one Face ID. A larger payment also takes one Face ID, then leaves 24 hours later, and the client can cancel it until then. The money it will take is set aside, so the client cannot spend it twice. Swissquote refuses a payment above 10,000 USDC, or one that takes the day's total above 5,000 USDC.

## What happens when the phone is lost

The client has lost Share A and the old passkey. Swissquote Wallet recovers the same wallet by replacing those keys:

1. The client opens the app on a new phone and loads the Recovery Key file.
2. If the wallet is linked, the client enters their ID card number, which Swissquote matches to their KYC record when the recovery starts. In the demo this check is mocked. An unlinked wallet skips this step.
3. The new phone creates a new passkey and a new wallet key, split into new shares A, B and C.
4. Swissquote prepares the recovery, naming the new key and passkey. The Recovery Key signs that exact recovery.
5. Swissquote and the independent service each check the Recovery Key's signature before releasing their old shares B and C to the new phone. The independent service also checks Swissquote's signed approval, and that the operation can only start a recovery.
6. The new phone rebuilds the old wallet key for one signature. The smart account checks it and the Recovery Key's signature, then starts a 48-hour delay.
7. While the recovery waits, the client can cancel it from the old phone, if they still have it, or through Swissquote. After the delay, the new key and passkey take over.

The smart account enforces the delay in blockchain time, not a timer in the app. The wallet keeps its address and its funds. Recovery moves no funds. The old keys keep working until someone finalizes the recovery after the delay, so the wait is a chance to step in, not a freeze.

If a thief may be using the old phone of a linked wallet, the client locks it from the new phone or by calling Swissquote. Swissquote then refuses to help that phone pay, and stops its large payments before they leave. An unlinked wallet has no lock, because Swissquote has no ID to check the report against.

The Recovery Key is a separate key, not a fourth share. Neither Swissquote nor the independent service can start a recovery without it.

## An attacker with the stolen phone and email

A thief who holds the client's phone and email inbox gets nowhere, whether the wallet is linked or not. Without the client's Face ID, the phone signs nothing. There is no email reset to abuse. The Recovery Key is not on the phone, and a forged one matches no wallet. On a linked wallet the thief's own ID does not match the client's KYC record either. If a thief with the real Recovery Key did start a recovery, the client would have 48 hours to cancel it, from the old phone or through Swissquote. On a linked wallet that thief would also need a forged ID. The demo plays this attacker with `npm run attack <account>`, and every attempt fails.

A thief who can unlock the phone is harder. On a linked wallet, they are stopped once the client reports the phone and Swissquote locks it. An unlinked wallet has no lock, so they can pay within Swissquote's limits for as long as they hold the phone.

## If Swissquote's services are gone

If Swissquote's services are gone for 30 days, the independent service opens exit mode. It releases Share C for a payment that the client's passkey approved. The phone rebuilds the key from A and C, signs with Face ID and sends the payment to the chain itself, paying its own fee. A client who still has their phone gets their funds out without Swissquote. In the demo the exit runs from the command line, after `npm run sunset` closes Swissquote's services. Losing the phone while Swissquote is gone is not covered yet.

## Why it matters for Swissquote

Swissquote Wallet keeps self-custody clients and their assets at Swissquote instead of losing them to an external wallet. Swissquote's H1 2026 results give about CHF 600 of revenue a year and CHF 79,000 of client assets per account, so each client who leaves takes both. Our model is 10,000 wallets × (10% kept + 10% new) × CHF 600 = CHF 1.2 million a year, and CHF 79 million of assets that stays. The fee lines about cancel out. Swaps at the published 1% fee and Swissquote Plus bring in about CHF 620,000 a year, and free transfers into the wallet and sponsored gas cost about CHF 612,000. The client keeps the signatures needed to spend.

The independent service splits recovery help between two companies. The passkey protects everyday payments. The offline Recovery Key and the on-chain delay protect the replacement of lost keys. Each mechanism covers a different part of the lost-phone problem.

## What the prototype shows

The build includes verified Shamir shares, passkeys checked by the smart account, gas sponsorship with abuse limits, the compliance checks, the 24-hour hold on large payments, the optional link to a Swissquote account, the lock on a lost phone, the 48-hour recovery and cancel rules, and the exit without Swissquote. Swissquote and the independent service run separate share vaults, in separate processes. The code runs on a local chain and supports Base Sepolia.

The Swissquote sign-in that links a wallet, the KYC record and the ID check are mocked. The share vaults use software encryption, not production HSMs. The key split is our own short code on an established library and needs an audit. Production work includes real identity checks, recovery alerts, stronger storage on the phone and a security review. Recovery needs both share holders to be available. Swissquote can withhold its share, lock a phone and cancel a pending recovery. Those are availability powers. They do not give Swissquote the power to spend.

## Closing line

Swissquote Wallet lets a client approve payments with Face ID and recover a lost phone through Swissquote and an independent service, while the smart account keeps the power to spend with the client.
