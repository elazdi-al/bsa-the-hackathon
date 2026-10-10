// node lib/wallet/shamir.check.ts
import assert from 'node:assert/strict'
import { generatePrivateKey } from 'viem/accounts'
import { combine, split } from './shamir.ts'

for (let i = 0; i < 50; i++) {
  const key = generatePrivateKey()
  const [a, b, c] = split(key)
  for (const [x, y] of [[a, b], [b, a], [a, c], [b, c], [c, b]]) assert.equal(combine(x, y), key)
  assert.notEqual(split(key)[1], b, 'each split draws a new line')
  assert.throws(() => combine(a, a))
}
console.log('shamir ok')
