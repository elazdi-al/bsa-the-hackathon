// node lib/wallet/shamir.check.ts
import assert from "node:assert/strict";
import { privateKeyToAddress } from "viem/accounts";
import { combine, signerOf, split, verifyShare } from "./shamir.ts";

for (let i = 0; i < 50; i++) {
  const { key, shares, commitments } = split();
  const { phone, swissquote, partner } = shares;
  for (const [a, b] of [[phone, swissquote], [swissquote, phone], [phone, partner], [swissquote, partner]]) {
    assert.equal(combine(a, b), key, "any two shares rebuild the key");
  }
  assert.equal(signerOf(commitments), privateKeyToAddress(key), "commitments name the key's address");
  for (const share of [phone, swissquote, partner]) assert.ok(verifyShare(share, commitments), "each share matches the commitments");

  const other = split();
  assert.ok(!verifyShare(other.shares.swissquote, commitments), "a share of another key is refused");
  assert.ok(!verifyShare({ ...swissquote, x: 3 }, commitments), "a share at the wrong position is refused");
  assert.notEqual(combine(phone, other.shares.partner), key, "shares of different keys do not combine");
}
assert.throws(() => combine(split().shares.phone, split().shares.phone), /different shares/);
console.log("shamir: ok");
