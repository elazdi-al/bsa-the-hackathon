// The wallet's screens end to end in Chromium, each phone a fresh browser profile with a virtual
// passkey authenticator: create a wallet, send USDC, lose the phone and recover with the Recovery Key
// file; Swissquote cancels once, the old phone cancels once from Home, then the 48-hour delay passes
// (fast-forwarded on anvil) and the new phone sends.
//
//   npm run e2e:ui            (against `npm run local`; HEADED=1 to watch)
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import { createWalletClient, erc20Abi, formatUnits, http, numberToHex, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress } from "viem/accounts";
import { addresses, chain, publicClient, rpcUrl } from "../lib/wallet/env.ts";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const FRIEND = privateKeyToAddress(generatePrivateKey());
const SLOW = { timeout: 30_000 };

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const swissquote = createWalletClient({ account: privateKeyToAccount(process.env.SWISSQUOTE_KEY as Hex), chain, transport: http(rpcUrl) });
const usdcOf = (owner: Address) => publicClient.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: "balanceOf", args: [owner] });

async function newPhone() {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
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

const walletOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("swissquote.wallet.device") ?? "null")?.address as string);

async function send(page: Page, to: Address, amount: string) {
  await page.goto(`${APP}/send?to=${to}`);
  await page.getByLabel("Amount in USDC").fill(amount);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click(SLOW);
  await page.waitForURL("**/transaction-tracking?**", SLOW);
  await page.getByText("Completed").first().waitFor(SLOW);
}

async function recover(page: Page, kit: string) {
  await page.goto(`${APP}/recover`);
  await page.locator("input[type=file]").setInputFiles(kit);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Scan ID" }).click();
  await page.getByRole("button", { name: "Restore with Face ID" }).click(SLOW);
  await page.getByText("Your wallet will be restored on").waitFor(SLOW);
}

console.log("1. Create: passkey, split the wallet key 2-of-3, save the Recovery Key file");
const phone1 = await newPhone();
await phone1.goto(`${APP}/onboarding-welcome`);
await phone1.getByRole("link", { name: "Create new wallet" }).click();
await phone1.getByRole("button", { name: "Create Passkey" }).click(SLOW);
await phone1.getByRole("button", { name: "Split Wallet Key" }).click(SLOW);
const download = phone1.waitForEvent("download", SLOW);
await phone1.getByRole("button", { name: "Save Recovery Key" }).click(SLOW);
const kit = await (await download).path();
await phone1.waitForURL("**/home", SLOW);
const wallet = (await walletOf(phone1)) as Address;
console.log(`   wallet ${wallet}`);
await swissquote.writeContract({ address: addresses.usdc, abi: parseAbi(["function mint(address, uint256)"]), functionName: "mint", args: [wallet, parseUnits("100", 6)] });

console.log("2. Send 20 USDC from the Send screen: Face ID, Swissquote pays the gas, tracking shows it completed");
await send(phone1, FRIEND, "20");
assert.equal(await usdcOf(FRIEND), parseUnits("20", 6));

console.log("3. New phone: Recovery Key file, ID check, new passkey and key; Swissquote cancels it for the user");
const phone2 = await newPhone();
await recover(phone2, kit);
await phone2.getByRole("button", { name: "Cancel recovery" }).click();
await phone2.getByText("Recover your wallet").waitFor(SLOW);

console.log("4. Again; the old phone sees it on Home and cancels it with Face ID");
await recover(phone2, kit);
await phone1.goto(`${APP}/home`);
await phone1.getByText("Someone started recovering your wallet").waitFor(SLOW);
await phone1.getByRole("button", { name: "Cancel recovery" }).click(SLOW);
await phone1.getByText("Someone started recovering your wallet").waitFor({ state: "detached", ...SLOW });

console.log("5. Again; the 48-hour delay passes on the chain and on the phone's clock, then finish");
await recover(phone2, kit);
await publicClient.request({ method: "evm_increaseTime", params: [numberToHex(48 * 3600 + 10)] } as never);
await publicClient.request({ method: "evm_mine", params: [] } as never);
await phone2.clock.setFixedTime((Number((await publicClient.getBlock()).timestamp) + 60) * 1000);
await phone2.getByRole("button", { name: "Finish recovery" }).click(SLOW);
await phone2.waitForURL("**/home", SLOW);

console.log("6. The new phone sends 5 USDC: same address, same balance");
await send(phone2, FRIEND, "5");
assert.equal(await walletOf(phone2), wallet);
console.log(`   friend has ${formatUnits(await usdcOf(FRIEND), 6)} USDC, the wallet ${formatUnits(await usdcOf(wallet), 6)} USDC`);

await browser.close();
console.log("All good.");
