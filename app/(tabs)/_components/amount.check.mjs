// Numpad amount entry: `node "app/(tabs)/_components/amount.check.mjs"`
import assert from "node:assert/strict";
import { grouped, press, quote, typed } from "./amount.ts";

const type = (keys, decimals = 2) => [...keys].reduce((t, k) => press(t, k === "<" ? "back" : k, decimals) ?? t, "");

assert.equal(type("0"), "0");
assert.equal(type("05"), "5", "a leading zero gives way");
assert.equal(press("0", "0", 2), null, "no second leading zero");
assert.equal(type("."), "0.", "a bare dot starts at zero");
assert.equal(press("1.2", ".", 2), null, "one dot");
assert.equal(type("1.234"), "1.23", "decimals capped");
assert.equal(type("1.2345", 4), "1.2345");
assert.equal(type("1234567890"), "123456789", "whole digits capped");
assert.equal(type("12<"), "1");
assert.equal(press("", "back", 2), null, "nothing to delete");

assert.equal(grouped(""), "0");
assert.equal(grouped("1234.5"), "1,234.5");
assert.equal(grouped("1000."), "1,000.");
assert.equal(grouped("0.50"), "0.50");

assert.equal(typed(80.06, 4), "80.06");
assert.equal(typed(1 / 3, 2), "0.33");
assert.equal(typed(0.001, 2), "", "rounds to nothing");

const price = 10_400 / 80.06;
const max = quote(typed(80.06 * price, 2), "usd", price, 1);
assert.equal(typed(max.tokens, 4), "80.06", "max typed in dollars converts back to the balance");
assert.deepEqual(quote("2", "token", 100, 1), { tokens: 2, usd: 200, out: 200 });
assert.deepEqual(quote("50", "usd", 100, 1), { tokens: 0.5, usd: 50, out: 50 });
console.log("amount ok");
