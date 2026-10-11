// Runs the whole onboarding against a CDP virtual authenticator, then checks what the wallet registered and the failure paths.
//
//   node scripts/onboarding.check.mjs [--base <url>]   (default: APP_URL from .env.local, else http://localhost:3000)

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { privateKeyToAddress } from "viem/accounts";

const flag = process.argv.indexOf("--base");
const base = flag > 0 ? process.argv[flag + 1] : (process.env.APP_URL ?? "http://localhost:3000");

const authenticator = {
  options: {
    protocol: "ctap2",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    hasPrf: true,
    automaticPresenceSimulation: true,
  },
};

const browser = await chromium.launch();
const errors = [];
let signIns = 0;

async function open(options = authenticator.options) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("request", (r) => new URL(r.url()).pathname === "/api/session" && signIns++);
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options });
  await page.goto(new URL("/onboarding-secure", base).href);
  await button(page, "Create Passkey").waitFor();
  return { page, cdp, authenticatorId };
}

const device = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("swissquote.wallet.device") ?? "null"));
const button = (page, name) => page.getByRole("button", { name });
const alertOf = (page) => page.getByRole("alert").filter({ hasText: /\S/ });
const shortAddress = (address) => `${address.slice(0, 6)}...${address.slice(-4)}`;
const isRegistration = (r) => new URL(r.url()).pathname === "/api/wallets" && r.request().method() === "POST";
const secretOf = async (download) => (await readFile(await download.path(), "utf8")).match(/0x[0-9a-f]{64}/)?.[0];

{
  const { page, cdp, authenticatorId } = await open();
  await button(page, "Create Passkey").click();
  await button(page, "Split Wallet Key").waitFor({ timeout: 15_000 });
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  assert.equal(credentials.length, 1, "the authenticator holds one resident credential");
  const credentialId = Buffer.from(credentials[0].credentialId, "base64").toString("base64url");

  await button(page, "Split Wallet Key").click();
  await button(page, "Save Recovery Key").waitFor({ timeout: 15_000 });
  const split = await device(page);
  assert.equal(split.credentialId, credentialId, "the phone keeps the authenticator's credential");
  assert.equal(split.share.x, 1, "the phone keeps Share A");
  assert.ok(split.share.sealed, "Share A is sealed under the passkey's PRF output");

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

  let registrations = 0;
  page.on("request", (r) => new URL(r.url()).pathname === "/api/wallets" && r.method() === "POST" && registrations++);
  await page.route("**/api/wallets", (r) => (r.request().method() === "POST" ? r.abort() : r.continue()));
  // A double click: without a share sheet the file saves at once, and its second click must not confirm.
  const [download] = await Promise.all([page.waitForEvent("download"), button(page, "Save Recovery Key").dblclick()]);
  assert.equal(download.suggestedFilename(), "Swissquote Wallet Recovery Key.txt");
  const secret = await secretOf(download);
  assert.ok(secret, "the file holds the recovery key");

  await button(page, "I saved it off this phone").waitFor();
  const [again] = await Promise.all([page.waitForEvent("download"), button(page, "Save again").click()]);
  assert.equal(await secretOf(again), secret, "Save again saves the same Recovery Key");
  await page.evaluate(() => {
    navigator.canShare = () => true;
    navigator.share = () => {
      window.sharedAgain = true;
      return Promise.reject(new DOMException("Share failed", "NotAllowedError"));
    };
  });
  await button(page, "Save again").click();
  await page.waitForFunction(() => window.sharedAgain);
  assert.equal(await alertOf(page).count(), 0, "a failed second save shows no error: the file was saved once");
  assert.equal(await button(page, "I saved it off this phone").isEnabled(), true, "a failed second save leaves the step as it is");
  assert.equal(registrations, 0, "the wallet registers only after the client confirms the Recovery Key is kept");

  await button(page, "I saved it off this phone").click();
  await button(page, "Try Again").waitFor({ timeout: 15_000 });
  assert.equal(registrations, 1, "confirming registers once");
  const setupError = "Your wallet isn't set up yet";
  await page.getByText(setupError).waitFor();
  assert.equal(await alertOf(page).count(), 0, "the setup row carries the failure, with no second alert under the button");
  await page.unroute("**/api/wallets");
  const created = page.waitForResponse(isRegistration);
  await button(page, "Try Again").click();
  const { address } = await (await created).json();
  await page.getByText("Your wallet is ready").waitFor({ timeout: 15_000 });
  await page.getByText(shortAddress(address)).waitFor();

  const res = await fetch(new URL(`/api/wallets/${address}`, base));
  assert.equal(res.status, 200, "Swissquote serves the registered wallet");
  const wallet = await res.json();
  const { signer, passkey } = await device(page);
  assert.equal(wallet.signer, signer, "the wallet is controlled by the key this phone split");
  assert.deepEqual(wallet.passkey, passkey, "the wallet checks this phone's passkey");
  assert.equal(wallet.recoveryKey, privateKeyToAddress(secret), "the wallet recovers with the saved key");
  assert.equal("owner" in wallet, false, "a new wallet is linked to no Swissquote client");
  assert.equal(signIns, 0, "creating a wallet never signs in to Swissquote");
  assert.equal(await page.evaluate(() => localStorage.getItem("swissquote.session")), null, "the phone keeps no Swissquote session");
  console.log(`registered ${address}: signer ${signer}, recovery key ${wallet.recoveryKey}`);
  await page.context().close();
}

{
  // Chrome's virtual PRF authenticator stays unusable after a failed verification, so this block uses a plain one.
  const { page, cdp, authenticatorId } = await open({ ...authenticator.options, hasPrf: false });
  // Without Face ID the ceremony fails at once with the NotAllowedError a user cancel produces.
  await cdp.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: false });
  await button(page, "Create Passkey").click();
  const alert = alertOf(page);
  await alert.waitFor({ timeout: 15_000 });
  assert.equal((await alert.textContent())?.trim(), "Your passkey wasn't created. Try again.");
  assert.equal(await button(page, "Create Passkey").isEnabled(), true, "the button is back to idle");

  await cdp.send("WebAuthn.setUserVerified", { authenticatorId, isUserVerified: true });
  await button(page, "Create Passkey").click();
  await button(page, "Split Wallet Key").waitFor({ timeout: 15_000 });
  assert.equal(await alert.count(), 0, "a retry clears the error");
  await page.context().close();
}

await browser.close();
if (errors.length) console.log(`page console errors:\n${errors.join("\n")}`);
console.log("onboarding ok");
