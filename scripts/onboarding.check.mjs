// Runs the whole onboarding against a CDP virtual authenticator, then checks what W registered and the failure paths.
//
//   node scripts/onboarding.check.mjs [--base <url>]   (default http://localhost:3000)

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js";
import { chromium } from "playwright";

const flag = process.argv.indexOf("--base");
const base = flag > 0 ? process.argv[flag + 1] : "http://localhost:3000";

const authenticator = {
  options: {
    protocol: "ctap2",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
};

const browser = await chromium.launch();
const errors = [];

async function open() {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", authenticator);
  await page.goto(new URL("/onboarding-secure", base).href, { waitUntil: "networkidle" });
  return { page, cdp, authenticatorId };
}

const session = (page) => page.evaluate(() => fetch("/api/auth/get-session").then((r) => r.json()));
const button = (page, name) => page.getByRole("button", { name });
const alertOf = (page) => page.getByRole("alert").filter({ hasText: /\S/ });
const shortAddress = (address) => `${address.slice(0, 4)}...${address.slice(-4)}`;

{
  const { page, cdp, authenticatorId } = await open();
  assert.equal(await session(page), null, "starts signed out");
  await button(page, "Create Passkey").click();
  await button(page, "Split Wallet Key").waitFor({ timeout: 15_000 });
  assert.ok((await session(page))?.session, "the passkey signs in");
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  assert.equal(credentials.length, 1, "the authenticator holds one resident credential");
  const credentialId = Buffer.from(credentials[0].credentialId, "base64").toString("base64url");

  await button(page, "Split Wallet Key").click();
  await button(page, "Save Recovery Key").waitFor({ timeout: 30_000 });

  await page.evaluate(() => {
    navigator.canShare = () => true;
    navigator.share = () => {
      window.shared = true;
      return Promise.reject(new DOMException("Share canceled", "AbortError"));
    };
  });
  await button(page, "Save Recovery Key").click();
  await page.waitForFunction(() => window.shared);
  await page.locator('button[aria-busy="false"]', { hasText: "Save Recovery Key" }).waitFor();
  assert.equal(await alertOf(page).count(), 0, "closing the share sheet shows no error");
  await page.evaluate(() => {
    delete navigator.canShare;
    delete navigator.share;
  });

  await page.route("**/wallet/create", (r) => r.abort());
  const [download] = await Promise.all([page.waitForEvent("download"), button(page, "Save Recovery Key").click()]);
  assert.equal(download.suggestedFilename(), "Fuse Recovery Key.txt");
  const secret = (await readFile(await download.path(), "utf8")).match(/0x[0-9a-f]{64}/)?.[0];
  assert.ok(secret, "the file holds the recovery secret");

  await button(page, "Try Again").waitFor({ timeout: 15_000 });
  const setupError = "Your wallet isn't set up yet";
  await page.getByText(setupError).waitFor();
  assert.equal(await alertOf(page).count(), 0, "the setup row carries the failure, with no second alert under the button");
  await page.unroute("**/wallet/create");
  const created = page.waitForResponse((r) => r.url().includes("/wallet/create") && r.request().method() === "POST");
  await button(page, "Try Again").click();
  const { address } = await (await created).json();
  await page.getByText("Your wallet is ready").waitFor({ timeout: 15_000 });
  await page.getByText(shortAddress(address)).waitFor();

  const res = await fetch(new URL(`/api/auth/wallet/state?address=${address}`, base));
  assert.equal(res.status, 200, "W is readable on the chain");
  const w = await res.json();
  assert.equal(w.address, address);
  assert.equal(w.credentials.passkey.credentialId, credentialId, "W registered the authenticator's credential");
  assert.match(w.credentials.mpcKey, /^0x0[23][0-9a-f]{64}$/, "W registered a compressed group key");
  const recoveryKey = `0x${bytesToHex(schnorr.getPublicKey(hexToBytes(secret.slice(2))))}`;
  assert.equal(w.credentials.recoveryKey, recoveryKey, "W registered the public key of the saved secret");
  console.log(`registered ${address}: credential ${credentialId}, group key ${w.credentials.mpcKey}, recovery key ${recoveryKey}`);
  console.log(`setup failure: "${setupError}", retry registered`);
  await page.context().close();
}

{
  const { page, cdp, authenticatorId } = await open();
  // With no authenticator Chrome waits out the 60s WebAuthn timeout, then rejects with the NotAllowedError a user cancel produces.
  await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  const started = performance.now();
  await button(page, "Create Passkey").click();
  const alert = alertOf(page);
  await alert.waitFor({ timeout: 90_000 });
  const message = (await alert.textContent())?.trim();
  assert.ok(message, "the alert carries the error message");
  await button(page, "Create Passkey").waitFor();
  assert.equal(await button(page, "Create Passkey").isEnabled(), true, "the button is back to idle");
  assert.equal(await session(page), null, "a failed ceremony does not sign in");
  console.log(`no authenticator: "${message}" after ${Math.round(performance.now() - started)}ms`);

  await cdp.send("WebAuthn.addVirtualAuthenticator", authenticator);
  await button(page, "Create Passkey").click();
  await button(page, "Split Wallet Key").waitFor({ timeout: 15_000 });
  assert.equal(await alert.count(), 0, "a retry clears the error");
  assert.ok((await session(page))?.session, "the retry signs in");
  console.log("retry with an authenticator: signed in");
  await page.context().close();
}

await browser.close();
if (errors.length) console.log(`page console errors:\n${errors.join("\n")}`);
console.log("onboarding ok");
