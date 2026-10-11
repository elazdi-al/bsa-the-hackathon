// SwissquoteAccount ABIs, gas limits and signature encoding, shared by the phone, the Wallet API and the partner.
import type { WebAuthnP256 } from "ox";
import { concat, encodeAbiParameters, keccak256, numberToHex, parseAbi, parseAbiParameter, toHex, type Address, type Hex } from "viem";

export type Passkey = { x: Hex; y: Hex };

/** A WebAuthn assertion, as returned by ox's WebAuthnP256.sign. */
export type PasskeyAssertion = Pick<WebAuthnP256.sign.ReturnType, "metadata" | "signature">;

export type Config = { signer: Address; passkey: Passkey; recoveryKey: Address; guardian: Address };

const structs = [
  "struct Passkey { bytes32 x; bytes32 y; }",
  "struct Config { address signer; Passkey passkey; address recoveryKey; address guardian; }",
] as const;

export const accountAbi = parseAbi([
  ...structs,
  "function execute(address target, uint256 value, bytes data)",
  "function initiateRecovery(address newSigner, Passkey newPasskey)",
  "function cancelRecovery()",
  "function finalizeRecovery()",
  "function signer() view returns (address)",
  "function passkey() view returns (bytes32 x, bytes32 y)",
  "function recoveryKey() view returns (address)",
  "function pendingRecovery() view returns (address signer, Passkey passkey, uint48 executeAfter)",
  "error Unauthorized()",
  "error RecoveryPending()",
  "error NoRecoveryPending()",
  "error RecoveryNotReady(uint48 executeAfter)",
]);

export const factoryAbi = parseAbi([
  ...structs,
  "function createAccount(Config config, uint256 salt) returns (address)",
  "function getAddress(Config config, uint256 salt) view returns (address)",
]);

export const paymasterAbi = parseAbi([
  "struct PackedUserOperation { address sender; uint256 nonce; bytes initCode; bytes callData; bytes32 accountGasLimits; uint256 preVerificationGas; bytes32 gasFees; bytes paymasterAndData; bytes signature; }",
  "function getHash(PackedUserOperation userOp, uint48 validUntil, uint48 validAfter) view returns (bytes32)",
]);

// ponytail: fixed limits sized for a first operation that deploys the account plus a token
// transfer with on-chain P-256 verification; estimate per operation once dApp calls need more.
export const ACCOUNT_GAS = { callGasLimit: 300_000n, verificationGasLimit: 1_000_000n, preVerificationGas: 50_000n };

const validity = [{ type: "uint48" }, { type: "uint48" }] as const;

/** The VerifyingPaymaster's window in paymasterData, in chain seconds: valid at once (validAfter 0), no later than validUntil. */
export const encodeSponsorship = (validUntil: number, signature: Hex) => concat([encodeAbiParameters(validity, [validUntil, 0]), signature]);

const webAuthnAuth = parseAbiParameter(
  "(bytes32 r, bytes32 s, uint256 challengeIndex, uint256 typeIndex, bytes authenticatorData, string clientDataJSON)",
);

/** MODE_NORMAL: the wallet key's signature and the passkey assertion, both over the userOpHash. */
export function encodeNormalSignature(keySignature: Hex, { metadata, signature }: PasskeyAssertion): Hex {
  return concat([
    "0x00",
    encodeAbiParameters(
      [{ type: "bytes" }, webAuthnAuth],
      [
        keySignature,
        {
          r: numberToHex(signature.r, { size: 32 }),
          s: numberToHex(signature.s, { size: 32 }),
          challengeIndex: BigInt(metadata.challengeIndex!),
          typeIndex: BigInt(metadata.typeIndex!),
          authenticatorData: metadata.authenticatorData,
          clientDataJSON: metadata.clientDataJSON,
        },
      ],
    ),
  ]);
}

/** MODE_RECOVERY: the wallet key's signature (rebuilt from B + C) and the recovery key's. */
export function encodeRecoverySignature(keySignature: Hex, recoverySignature: Hex): Hex {
  return concat(["0x01", encodeAbiParameters([{ type: "bytes" }, { type: "bytes" }], [keySignature, recoverySignature])]);
}

/** What the recovery key signs to have Swissquote cancel a pending recovery for the client. */
export const cancelRecoveryMessage = (wallet: Address, executeAfter: number) =>
  `Cancel the recovery of wallet ${wallet.toLowerCase()} pending until ${executeAfter}.`;

/** What the wallet key signs to name the recovery key that may release its shares. */
export const bindRecoveryKeyMessage = (signer: Address, recoveryKey: Address) =>
  `Wallet key ${signer.toLowerCase()} is recovered with ${recoveryKey.toLowerCase()}.`;

/** The statement that links a wallet to a Swissquote client. */
export const ownershipMessage = (client: string, wallet: Address) => `Wallet ${wallet.toLowerCase()} belongs to Swissquote client ${client}.`;

/**
 * What the passkey signs, with Face ID, to link the wallet: the statement. Swissquote keeps the assertion as the
 * wallet's ownership proof, the one a Travel Rule check asks for.
 */
export const ownershipChallenge = (client: string, wallet: Address) => keccak256(toHex(ownershipMessage(client, wallet)));

/** What the recovery key signs to find the wallet it restores. `at`, in seconds, keeps a logged signature from working later. */
export const findWalletMessage = (at: number) => `Find the Swissquote Wallet this Recovery Key restores, at ${at}.`;
