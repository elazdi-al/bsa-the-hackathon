// SwissquoteAccount ABIs and signature encoding. Isomorphic: used by the phone, the
// Wallet API and both share services.
import type { WebAuthnP256 } from 'ox'
import { concat, encodeAbiParameters, numberToHex, parseAbi, parseAbiParameter, type Address, type Hex } from 'viem'

export type Passkey = { x: Hex; y: Hex }

/** A WebAuthn assertion, as returned by ox's WebAuthnP256.sign. */
export type PasskeyAssertion = Pick<WebAuthnP256.sign.ReturnType, 'metadata' | 'signature'>

const structs = [
  'struct Passkey { bytes32 x; bytes32 y; }',
  'struct Config { address signer; Passkey passkey; address confirmationKey; address guardian; }',
] as const

export const accountAbi = parseAbi([
  ...structs,
  'function execute(address target, uint256 value, bytes data)',
  'function initiateRecovery(address newSigner, Passkey newPasskey)',
  'function cancelRecovery()',
  'function finalizeRecovery()',
  'function signer() view returns (address)',
  'function passkey() view returns (bytes32 x, bytes32 y)',
  'function confirmationKey() view returns (address)',
  'function pendingRecovery() view returns (address signer, Passkey passkey, uint48 executeAfter)',
])

export const factoryAbi = parseAbi([
  ...structs,
  'function createAccount(Config config, uint256 salt) returns (address)',
  'function getAddress(Config config, uint256 salt) view returns (address)',
])

export const paymasterAbi = parseAbi([
  'struct PackedUserOperation { address sender; uint256 nonce; bytes initCode; bytes callData; bytes32 accountGasLimits; uint256 preVerificationGas; bytes32 gasFees; bytes paymasterAndData; bytes signature; }',
  'function getHash(PackedUserOperation userOp, uint48 validUntil, uint48 validAfter) view returns (bytes32)',
])

const webAuthnAuth = parseAbiParameter(
  '(bytes32 r, bytes32 s, uint256 challengeIndex, uint256 typeIndex, bytes authenticatorData, string clientDataJSON)',
)

/** MODE_NORMAL: wallet key signature and passkey assertion, both over the userOpHash. */
export function encodeNormalSignature(keySignature: Hex, assertion: PasskeyAssertion): Hex {
  const { metadata, signature } = assertion
  return concat([
    '0x00',
    encodeAbiParameters(
      [{ type: 'bytes' }, webAuthnAuth],
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
  ])
}

/** MODE_RECOVERY: wallet key signature (rebuilt from Shares B + C) and the user's recovery key. */
export function encodeRecoverySignature(keySignature: Hex, confirmationSignature: Hex): Hex {
  return concat(['0x01', encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes' }], [keySignature, confirmationSignature])])
}

/**
 * What the recovery key signs (EIP-191) on a new phone to find its wallet. `at` is the time in
 * seconds, so a signature seen once cannot be replayed later.
 */
export const kitProof = (at: number) => `Recover my Swissquote Wallet, ${at}`

const dummyEcdsa: Hex = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b`

/** Well-formed, sized like a real one, so bundler gas estimation (incl. L1 data fee) is realistic. */
export const stubSignature = encodeNormalSignature(dummyEcdsa, {
  metadata: {
    authenticatorData: `0x${'49'.repeat(32)}0500000000`,
    clientDataJSON: `{"type":"webauthn.get","challenge":"${'A'.repeat(43)}","origin":"https://wallet.swissquote.ch","crossOrigin":false,"other_keys_can_be_added_here":"${'x'.repeat(80)}"}`,
    challengeIndex: 23,
    typeIndex: 1,
  },
  signature: { r: 1n, s: 1n },
})

export const stubRecoverySignature = encodeRecoverySignature(dummyEcdsa, dummyEcdsa)
