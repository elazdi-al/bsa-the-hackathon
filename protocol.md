# Protocol

The custody and recovery protocol the team agreed on. Code and docs follow it; where they disagree, this file wins. The recovery key and the confirmation key are the same key.

## Normal operation

2-of-3 Shamir with three participants:

- Share A: the user's phone.
- Share B: the Swissquote server.
- Share C: an independent third-party service.

Rules:

- Any 2 of the 3 Shamir shares can jointly produce a signature.
- The phone caches the private key so that it does not redo Shamir on every transaction. The cache has a set time to live, so the key is never stored forever, and it is cleared every time the app closes.
- A separate user passkey, stored on the phone, is also required.
- The ERC-4337 smart contract verifies the passkey authorization.
- Security: even if Swissquote and the third-party service collude, they cannot transfer funds without the user's passkey.

## Wallet recovery (lost phone)

1. The user loses access to their phone, Shamir Share A and the passkey.
2. Swissquote (Share B) and the independent service (Share C) jointly authorize recovery.
3. The user must also provide a separate recovery key stored securely at home.
4. The smart contract verifies the Shamir authorization and the confirmation-key signature.
5. A mandatory 48-hour on-chain recovery delay begins.
6. After the delay, recovery can be finalized. It replaces the lost credentials and preserves the wallet address and funds.

During the delay, the user can cancel the recovery from the phone app or through Swissquote's services.
