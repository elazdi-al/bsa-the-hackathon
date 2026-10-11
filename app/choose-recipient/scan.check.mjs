// What a scanned QR code pays: `node app/choose-recipient/scan.check.mjs`
import assert from "node:assert/strict";
import decodeQR from "qr/decode.js";
import { encode } from "uqr";
import { scannedRecipient } from "./scan.ts";

const to = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const usdc = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const other = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

assert.deepEqual(scannedRecipient(to), { to }, "a bare address, as the Receive sheet shows");
assert.deepEqual(scannedRecipient(` ${to}\n`), { to });
assert.deepEqual(scannedRecipient(to.toLowerCase()), { to: to.toLowerCase() });
assert.deepEqual(scannedRecipient(`ethereum:${to}`), { to });
assert.deepEqual(scannedRecipient(`ethereum:pay-${to}@8453?value=1e18`), { to }, "an ETH amount isn't USDC");
assert.deepEqual(scannedRecipient(`ethereum:${usdc}@8453/transfer?address=${to}&uint256=2.5e6`, usdc), { to, amount: "2.5" });
assert.deepEqual(scannedRecipient(`ethereum:${usdc.toLowerCase()}/transfer?address=${to}&uint256=20000000`, usdc), { to, amount: "20" });
assert.deepEqual(scannedRecipient(`ethereum:${other}/transfer?address=${to}&uint256=5e6`, usdc), { to }, "another token's amount is dropped");
assert.deepEqual(scannedRecipient(`ethereum:${usdc}/transfer?address=${to}&uint256=1e30`, usdc), { to }, "an amount the field can't hold is dropped");
assert.deepEqual(scannedRecipient(`ethereum:${usdc}/transfer?address=${to}`, usdc), { to });
assert.equal(scannedRecipient(`ethereum:${usdc}/approve?address=${to}&uint256=1e6`, usdc), null, "only a transfer pays someone");
assert.equal(scannedRecipient(`ethereum:${usdc}/transfer?uint256=1e6`, usdc), null);
assert.equal(scannedRecipient("https://swissquote.com"), null);
assert.equal(scannedRecipient("anna.eth"), null);
assert.equal(scannedRecipient(`${to}00`), null);
assert.equal(scannedRecipient(""), null);

// The fallback decoder, where the camera has no BarcodeDetector (iOS, Safari), reads the Receive sheet's code:
// error correction H with the centre cleared for the badge, drawn here 8 pixels a module with a quiet zone.
const { data, size } = encode(to, { ecc: "H", border: 0 });
const c = (size - 1) / 2;
const dark = (x, y) => data[y]?.[x] && !(Math.abs(x - c) < 4.5 && Math.abs(y - c) < 4.5);
const side = (size + 8) * 8;
const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
for (let i = 0; i < side * side; i++) if (dark(Math.floor((i % side) / 8) - 4, Math.floor(i / side / 8) - 4)) pixels.fill(0, i * 4, i * 4 + 3);
assert.equal(decodeQR({ width: side, height: side, data: pixels }), to);

console.log("scan ok");
