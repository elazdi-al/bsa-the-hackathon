import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { canonicalJson, hashPayload, hashRequest } from "../../lib/compliance/canonical";
import type { ComplianceDecision, DecisionSigner, SignedDecision } from "../../lib/compliance/types";

const domain = "swissquote-compliance/decision/v1\n";
export class Ed25519DecisionSigner implements DecisionSigner {
  readonly publicKeyPem: string;
  readonly keyId: string;
  private readonly privateKey: KeyObject;
  constructor(privateKeyPem?: string) {
    this.privateKey = privateKeyPem ? createPrivateKey(privateKeyPem) : generateKeyPairSync("ed25519").privateKey;
    if (this.privateKey.asymmetricKeyType !== "ed25519") throw new Error("Decision key must be Ed25519");
    this.publicKeyPem = createPublicKey(this.privateKey).export({ type: "spki", format: "pem" }).toString();
    this.keyId = hashPayload("swissquote-compliance/key/v1", this.publicKeyPem);
  }
  sign(decision: ComplianceDecision): SignedDecision {
    // Detach the result to avoid mutating any signed object after signing.
    const snapshot = JSON.parse(canonicalJson(decision)) as ComplianceDecision;
    return { decision: snapshot, proof: { algorithm: "Ed25519", keyId: this.keyId,
      signature: sign(null, Buffer.from(domain + canonicalJson(snapshot)), this.privateKey).toString("base64url") } };
  }
}

export interface VerificationOptions {
  publicKeyPem: string; // configured trust anchor; never taken from the response being verified
  request: unknown;
  subject: string;
  policyHash: string;
  now?: Date;
  allowDemo?: boolean;
  allowStepUp?: boolean; // true only after the host has verified extra authentication
}
export function verifyDecision(receipt: SignedDecision, options: VerificationOptions): boolean {
  try {
    const { decision, proof } = receipt;
    if (decision.schemaVersion !== "1" || proof.algorithm !== "Ed25519") return false;
    if (proof.keyId !== hashPayload("swissquote-compliance/key/v1", options.publicKeyPem)) return false;
    const key = createPublicKey(options.publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") return false;
    if (!verify(null, Buffer.from(domain + canonicalJson(decision)), key, Buffer.from(proof.signature, "base64url"))) return false;
    const now = (options.now ?? new Date()).getTime();
    const issuedAt = Date.parse(decision.issuedAt);
    const expiresAt = Date.parse(decision.expiresAt);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now + 5000 || expiresAt <= now || expiresAt <= issuedAt) return false;
    if (decision.requestHash !== hashRequest(options.request) || decision.policyHash !== options.policyHash) return false;
    if (decision.subjectHash !== hashPayload("swissquote-compliance/subject/v1", options.subject)) return false;
    if (decision.assurance === "DEMO" && !options.allowDemo) return false;
    return decision.status === "ALLOW" || (decision.status === "STEP_UP" && options.allowStepUp === true);
  } catch { return false }
}
