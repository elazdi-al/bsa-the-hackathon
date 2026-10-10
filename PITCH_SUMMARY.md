# Fuse pitch summary

## The pitch

Fuse is a self-custody wallet that Swissquote could offer its clients, with passkey-approved payments, bank-sponsored network fees, and a recovery process for a lost phone. The client keeps spending authority. Swissquote provides transaction checks and recovery assistance.

The promise is simple: use your crypto with the ease of a banking app, and recover access without giving the bank the power to spend your funds.

## The problem

Self-custody puts a difficult burden on ordinary users. They must protect signing keys, understand transaction prompts, pay blockchain fees, and plan for losing their device. A lost key can mean permanent loss of access. A stolen key can expose the entire wallet.

Clients need an easier experience that preserves their control and gives them a practical recovery path. Swissquote could provide that assistance within a familiar client relationship.

## How Fuse works

The client creates a wallet with a passkey and saves a separate Recovery Key at home. Payments require the passkey, while Swissquote screens the requested transaction and sponsors approved operations through its paymaster. The user does not need to acquire a separate gas token for those sponsored payments.

Behind the interface, Fuse uses an ERC-4337 smart account and 2-of-3 Shamir secret sharing. The Wallet Key is split into three shares:

| Share | Holder | Role |
| --- | --- | --- |
| A | The client's phone | Participates in normal payments |
| B | Swissquote | Helps the client sign and recover |
| C | An independent service | Participates in lost-phone recovery |

Any two valid shares can reconstruct the Wallet Key. One share alone cannot. Each service checks its share against cryptographic commitments before storing it, and the phone checks that a reconstructed key matches the expected wallet signer.

For a normal payment, the phone uses A and B to reconstruct the Wallet Key locally. It can cache that key temporarily in memory to avoid repeating the reconstruction for every payment. Every payment still requires a fresh passkey approval, and the smart account verifies both the Wallet Key signature and the passkey assertion.

This is the central protection: even if Swissquote and the independent service combine B and C, the Wallet Key alone cannot authorize a normal payment. They still lack the client's passkey. Starting recovery requires the separate Recovery Key kept at home.

The prototype reconstructs the complete key on the phone and then signs. It uses Shamir sharing rather than a distributed signing protocol where the complete key never exists on one device.

## What happens when the phone is lost

The client has lost Share A and access to the old passkey. Fuse recovers the existing wallet by replacing those credentials:

1. The client opens Fuse on a new device and supplies the Recovery Key saved at home.
2. The new device creates a new passkey and a fresh Wallet Key, split into new shares A, B, and C.
3. Swissquote prepares a recovery operation naming the new signer and passkey. The client's Recovery Key signs that exact operation.
4. Swissquote and the independent service each verify the authorization before releasing their old shares B and C to the new device. The partner also checks Swissquote's signed approval and that the operation only starts recovery.
5. The new device reconstructs the old Wallet Key for the recovery signature. The smart account verifies both that signature and the Recovery Key signature, then starts a mandatory 48-hour delay.
6. While recovery is pending, the client can cancel from the old phone if it is still available, or request cancellation through Swissquote. After the delay, finalization installs the new signer and passkey.

The delay is enforced on-chain, not by a timer in the app. Finalization preserves the wallet address and its assets, and the old credentials stop authorizing payments. Recovery itself does not transfer the funds. Until finalization, the old credentials remain active, so the waiting period is a chance to intervene rather than a freeze.

The Recovery Key is a separate authorization key, not another Shamir share. Neither the bank nor the independent service can complete the recovery authorization without it.

## Why it matters for Swissquote

Fuse gives Swissquote a way to help clients use self-custodied assets while maintaining an ongoing service relationship. The bank can contribute transaction screening, gas sponsorship, and recovery support. The client retains the signatures required to authorize spending.

The independent share holder separates recovery assistance between two services. The passkey protects everyday payments, and the offline Recovery Key plus the on-chain delay protects credential replacement. Each mechanism addresses a different part of the lost-device problem.

## What the prototype demonstrates

The implementation includes verified Shamir shares, passkeys checked by the smart account, gas sponsorship, and the 48-hour recovery and cancellation rules. Swissquote and the partner run separate share vaults. The code supports a local demonstration and Base Sepolia testnet configuration.

Bank identity verification is mocked, and the share vaults use software encryption rather than production HSMs. Production work includes real identity checks, recovery alerts, stronger device storage, and security review. Recovery also depends on both services being available, and Swissquote's guardian can cancel a pending recovery. Those are assistance and availability powers, even though they do not grant spending authority.

## Closing line

Fuse lets a client approve payments with a passkey and recover a lost phone through Swissquote and an independent service, while the smart account keeps spending authority with the client.
