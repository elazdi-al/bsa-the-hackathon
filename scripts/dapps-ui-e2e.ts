// Browser regression against the local test stack, using a virtual passkey, not an OS authentication dialog.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { chain } from "../lib/wallet/env";
import { APP, mintUsdc } from "./software-phone";
import type { Address } from "viem";

assert.equal(chain.id, 31337, "UI mutation tests are local-chain only.");
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
let observedPage: Page | undefined;
try {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  observedPage = page;
  // Test-only redirect of the build-pinned partner URL to this isolated test process.
  if (process.env.PARTNER_URL) await context.route(`${process.env.BUILD_PARTNER_URL ?? "http://localhost:4002"}/**`, async (route) => {
    const source = new URL(route.request().url());
    const response = await route.fetch({ url: process.env.PARTNER_URL + source.pathname + source.search });
    await route.fulfill({ response });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => { console.error(`[browser at ${page.url()}] ${error.name}: ${error.message}`); errors.push(error.message); });
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
    protocol: "ctap2", ctap2Version: "ctap2_1", transport: "internal", hasResidentKey: true,
    hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true,
  } });
  const slow = { timeout: 30_000 };
  console.log("1. Create wallet and open Reviewed dApps from Home");
  await page.goto(`${APP}/onboarding-secure`);
  await page.getByRole("button", { name: "Create Passkey" }).click(slow);
  await page.getByRole("button", { name: "Split Wallet Key" }).click(slow);
  await page.getByRole("button", { name: "Save Recovery Key" }).click(slow);
  await page.getByRole("button", { name: "I saved it off this phone" }).click(slow);
  await page.waitForURL("**/home", slow);
  const wallet = await page.evaluate(() => JSON.parse(localStorage.getItem("swissquote.wallet.device")!).address as Address);
  await mintUsdc(wallet, "3000");
  await page.getByRole("link", { name: /Reviewed dApps/ }).click();
  const panel = page.getByRole("region", { name: "Vault interaction" });
  await panel.getByText("3000 USDC", { exact: true }).waitFor(slow);
  const input = page.getByLabel("Vault amount in USDC");
  const check = page.getByRole("button", { name: "Check transaction", exact: true });

  console.log("2. Editing the amount after a check takes the sign action away");
  await input.fill("25"); await check.click();
  await page.getByRole("button", { name: "Approve amount with passkey", exact: true }).waitFor(slow);
  await input.fill("26");
  assert.equal(await page.getByRole("button", { name: /with passkey/ }).count(), 0, "editing intent invalidates the prepared review");

  console.log("3. Exact approval, then a fresh deposit review and second passkey approval");
  await input.fill("25"); await check.click();
  await page.getByRole("button", { name: "Approve amount with passkey", exact: true }).click(slow);
  await page.getByText(/Permission granted, but no deposit/).waitFor(slow);
  await panel.getByText("Remaining spending permission: 25 USDC", { exact: true }).waitFor(slow);
  await check.click();
  await page.getByRole("button", { name: "Deposit with passkey", exact: true }).click(slow);
  await page.getByText("Deposit confirmed on-chain. Swissquote paid the network fee.", { exact: true }).waitFor(slow);
  await panel.getByText("2975 USDC", { exact: true }).waitFor(slow);

  console.log("4. Withdraw to the same wallet");
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  await input.fill("10"); await check.click();
  await page.getByRole("button", { name: "Withdraw with passkey", exact: true }).click(slow);
  await page.getByText("Withdraw confirmed on-chain. Swissquote paid the network fee.", { exact: true }).waitFor(slow);
  await panel.getByText("2985 USDC", { exact: true }).waitFor(slow);

  console.log("5. Expired review is not signable (injected stale response, no transaction)");
  await page.getByRole("button", { name: "Deposit", exact: true }).click();
  await input.fill("7");
  const operationRoute = "**/api/wallets/*/operations";
  await page.route(operationRoute, async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    await route.fulfill({ response, json: { ...json, expiresAt: new Date(Date.now() - 1000).toISOString() } });
  });
  await check.click();
  await page.getByText("This review expired. Check the transaction again before signing.").waitFor(slow);
  assert.equal(await page.getByRole("button", { name: /with passkey/ }).count(), 0);
  await page.unroute(operationRoute);

  console.log("6. Revoke permission left by a deposit that was not sent");
  await check.click();
  await page.getByRole("button", { name: "Approve amount with passkey", exact: true }).click(slow);
  await panel.getByText("Remaining spending permission: 7 USDC", { exact: true }).waitFor(slow);
  await page.getByRole("button", { name: "Revoke permission", exact: true }).click(); await check.click();
  await page.getByRole("button", { name: "Revoke permission with passkey", exact: true }).click(slow);
  await panel.getByText("Remaining spending permission: 0 USDC", { exact: true }).waitFor(slow);
  assert.deepEqual(errors, [], "no browser runtime errors");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no mobile horizontal overflow");
  // Full-page capture temporarily resizes the viewport, which can abort an otherwise valid
  // native view transition. Check flow errors first and let transitions settle before capture.
  await page.waitForTimeout(500);
  mkdirSync("shots", { recursive: true });
  await page.screenshot({ path: "shots/dapps-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "shots/dapps-desktop.png", fullPage: true });
  console.log("dApp browser end-to-end checks passed.");
} catch (error) {
  mkdirSync("shots", { recursive: true });
  if (observedPage) {
    console.error(await observedPage.locator("body").innerText());
    await observedPage.screenshot({ path: "shots/dapps-failure.png", fullPage: true }).catch(() => undefined);
  }
  throw error;
} finally { await browser.close(); }
