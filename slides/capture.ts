// Drives the real app through the demo story and writes the deck's phone screens to slides/screens/: an iPhone 15 Pro
// (393 × 852 at 3x) with its safe areas, so content sits below the status bar the deck draws on top. Each phone is a
// fresh browser profile with a virtual passkey authenticator. The app's demo labels (`data-demo`) are hidden, and a
// screen that still shows "demo", "mock", "signed in" or a middle dot fails the run. Run against a fresh `npm run local`:
//
//   node --env-file-if-exists=.env.local slides/capture.ts      (APP_URL, else http://localhost:$PORT)
import { chromium, type Locator, type Page } from "playwright";
import { createWalletClient, http, numberToHex, parseAbi, parseEther, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { addresses, chain, publicClient, rpcUrl } from "../lib/wallet/env.ts";

const APP = process.env.APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const SANCTIONED = "0x098B716B8Aaf21512996dC57EB0615e2383E2f96"; // flagged by the compliance demo screening
const SLOW = { timeout: 30_000 };

const browser = await chromium.launch();
const swissquote = createWalletClient({ account: privateKeyToAccount(process.env.SWISSQUOTE_KEY as Hex), chain, transport: http(rpcUrl) });

async function mint(to: Address, amount: string) {
  const hash = await swissquote.writeContract({ address: addresses.usdc, abi: parseAbi(["function mint(address, uint256)"]), functionName: "mint", args: [to, parseUnits(amount, 6)] });
  await publicClient.waitForTransactionReceipt({ hash });
}

async function newPhone() {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  // Hidden from the first paint, so nothing reflows just before a shot. Client navigation keeps the document, and the style.
  await context.addInitScript(() =>
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "[data-demo] { display: none !important; }";
      document.head.append(style);
    }),
  );
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 59, bottom: 34, left: 0, right: 0 } });
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true,
      automaticPresenceSimulation: true,
    },
  });
  page.on("pageerror", (error) => console.log(`   [page] ${error.message}`));
  return page;
}

/** Waits for `ready`, lets the animations settle, checks the screen shows no demo label, then writes slides/screens/<name>.png. */
async function shot(page: Page, name: string, ready: Locator, settle = 1000) {
  await ready.waitFor(SLOW);
  await page.waitForTimeout(settle);
  const label = (await page.evaluate(() => document.body.innerText)).match(/\b(demo|mock|signed in)\b|·/i);
  if (label) throw new Error(`${name}.png would show "${label[0]}". Mark the label data-demo, or reword it.`);
  await page.screenshot({ path: new URL(`screens/${name}.png`, import.meta.url).pathname });
  console.log(`   ${name}.png`);
}

async function review(page: Page, to: string, amount: string) {
  await page.goto(`${APP}/send?to=${to}`);
  await page.getByLabel("Amount in USDC").fill(amount);
  await page.getByText(/ available$/).waitFor(SLOW);
}

console.log("Old phone: create the wallet");
const phone1 = await newPhone();
await phone1.goto(`${APP}/onboarding-welcome`);
await shot(phone1, "onboarding-welcome", phone1.getByRole("link", { name: "Create new wallet" }), 1500);
await phone1.getByRole("link", { name: "Create new wallet" }).click();
await shot(phone1, "onboarding-secure", phone1.getByRole("button", { name: "Create Passkey" }), 2000);
await phone1.getByRole("button", { name: "Create Passkey" }).click();
await phone1.getByRole("button", { name: "Split Wallet Key" }).click(SLOW);
// The landed shares hold for 1.4 s before the Recovery Key step, so this one settles shorter.
await shot(phone1, "onboarding-split", phone1.getByText("Independent service holds its part"), 700);
await shot(phone1, "onboarding-recovery-key", phone1.getByRole("button", { name: "Save Recovery Key" }));
const download = phone1.waitForEvent("download", SLOW);
await phone1.getByRole("button", { name: "Save Recovery Key" }).click();
const kit = await (await download).path();
await phone1.getByRole("button", { name: "I saved it off this phone" }).click(SLOW);
await phone1.waitForURL("**/home", SLOW);
const wallet = await phone1.evaluate(() => JSON.parse(localStorage.getItem("swissquote.wallet.device")!).address as Address);
await mint(wallet, "100");
// Not linked yet, so the wallet pays its own network fees in ETH.
await publicClient.waitForTransactionReceipt({ hash: await swissquote.sendTransaction({ to: wallet, value: parseEther("0.01") }) });

console.log("Old phone: pay anna.eth 20 USDC, then a sanctioned address");
await review(phone1, "anna.eth", "20");
await phone1.getByRole("button", { name: "Continue" }).click();
await shot(phone1, "send-summary", phone1.getByText("Checked by Swissquote"));
await phone1.getByRole("button", { name: "Send", exact: true }).click();
await phone1.waitForURL("**/transaction-tracking?**", SLOW);
await shot(phone1, "transaction-tracking", phone1.getByText("Completed").first());
await phone1.goto(`${APP}/home`);
await shot(phone1, "home", phone1.locator("[role=slider][aria-valuetext]"), 2000);
await phone1.goto(`${APP}/history`);
await shot(phone1, "history", phone1.getByText(/^Sent to 0x4BA4/).first());
await review(phone1, SANCTIONED, "10");
await phone1.getByRole("button", { name: "Continue" }).click();
await shot(phone1, "send-refused-sanctioned", phone1.getByRole("alert"));
// The refused review keeps its recipient as a draft, which would reopen the chooser over Home.
await phone1.evaluate(() => sessionStorage.removeItem("swissquote:send-to"));

console.log("Old phone: link the wallet to a Swissquote account in Settings");
await phone1.goto(`${APP}/settings`);
await phone1.getByRole("button", { name: "Link your Swissquote account" }).click(SLOW);
await shot(phone1, "settings-link", phone1.getByRole("button", { name: "Link with Face ID" }));
await phone1.getByRole("button", { name: "Link with Face ID" }).click();
await phone1.getByRole("button", { name: "Done" }).click(SLOW);
await phone1.getByText("Swissquote account", { exact: true }).waitFor(SLOW);

console.log("New phone: recover with the Recovery Key file");
const phone2 = await newPhone();
await phone2.goto(`${APP}/recover`);
await shot(phone2, "recover", phone2.getByText("Recover your wallet"));
// Choosing the file reads it; a linked wallet recovers like any other, with the Recovery Key alone.
await phone2.locator("input[type=file]").setInputFiles(kit);
await phone2.getByRole("button", { name: "Restore with Face ID" }).click(SLOW);
await shot(phone2, "recover-hold", phone2.getByRole("button", { name: "Lock your old phone" }));
await phone1.goto(`${APP}/home`);
await shot(phone1, "home-recovery-alert", phone1.getByText("Someone started recovering your wallet"), 2000);
await publicClient.request({ method: "evm_increaseTime", params: [numberToHex(48 * 3600 + 10)] } as never);
await publicClient.request({ method: "evm_mine", params: [] } as never);
await shot(phone2, "recover-ready", phone2.getByRole("button", { name: "Finish recovery" }));

await browser.close();
