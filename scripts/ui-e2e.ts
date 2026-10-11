// The wallet's screens end to end in Chromium, each phone a fresh browser profile with a virtual
// passkey authenticator: create a wallet without a Swissquote account, scan a friend's QR code with a fake
// camera to pay them, send USDC under Swissquote's reading of each payment, its fee paid from the wallet's ETH, a
// large one at once like any other; link the wallet to a Swissquote account in Settings, and Swissquote pays its fees
// from then on; lose the phone and recover with the Recovery Key file alone, once a key no wallet uses is refused;
// Swissquote cancels once, the old phone cancels once from Home, the new phone locks the old one from its countdown
// with the Recovery Key, then the 48-hour delay passes, the new phone sends and links back to the same client.
// Then an unlinked wallet with no ETH is recovered on Swissquote's gas, with no lock offered. Last, Swissquote Plus is
// bought, not given: Home offers it, an unlinked wallet's /plus sends the client to link first, and a linked one buys
// it with Face ID.
//
//   npm run e2e:ui            (against `npm run local`; HEADED=1 to watch)
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { encode } from "uqr";
import { createWalletClient, erc20Abi, formatUnits, http, numberToHex, parseAbi, parseEther, parseUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress } from "viem/accounts";
import { addresses, chain, publicClient, rpcUrl } from "../lib/wallet/env.ts";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const FRIEND = privateKeyToAddress(generatePrivateKey());
const SLOW = { timeout: 30_000 };
/** The Send review's network fee: Swissquote's for a linked wallet, the wallet's own ETH for an unlinked one. */
const SPONSORED = /^Paid by Swissquote$/;
const FROM_WALLET = /^Up to [\d.]+ ETH, paid from your wallet$/;

/**
 * A still for Chromium's fake camera (.y4m, 640x480 greyscale): `text` as the Receive sheet draws its QR code,
 * error correction H with the centre cleared for the badge.
 */
function qrCamera(text: string) {
  const [width, height] = [640, 480];
  const { data, size } = encode(text, { ecc: "H", border: 0 });
  const scale = Math.floor(400 / size);
  const [left, top, c] = [(width - size * scale) / 2, (height - size * scale) / 2, (size - 1) / 2];
  const luma = Buffer.alloc(width * height, 255);
  for (let i = 0; i < luma.length; i++) {
    const [x, y] = [Math.floor((i % width - left) / scale), Math.floor((Math.floor(i / width) - top) / scale)];
    if (data[y]?.[x] && !(Math.abs(x - c) < 4.5 && Math.abs(y - c) < 4.5)) luma[i] = 0;
  }
  const chroma = Buffer.alloc(luma.length / 4, 128);
  const file = join(tmpdir(), `ui-e2e-${text}.y4m`);
  writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F30:1 Ip A1:1 C420jpeg\nFRAME\n`), luma, chroma, chroma]));
  return file;
}

const browser = await chromium.launch({
  headless: process.env.HEADED !== "1",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${qrCamera(FRIEND)}`],
});
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

const warp = async (seconds: number) => {
  await publicClient.request({ method: "evm_increaseTime", params: [numberToHex(seconds)] } as never);
  await publicClient.request({ method: "evm_mine", params: [] } as never);
};

async function until(check: () => Promise<boolean>, what: string) {
  for (const end = Date.now() + SLOW.timeout; !(await check()); await new Promise((r) => setTimeout(r, 500)))
    if (Date.now() > end) throw new Error(`Timed out waiting until ${what}`);
}

/**
 * Continue on the Send screen, up to the Face ID button, under Swissquote's plain reading of the payment and the
 * network fee it reads `fee`.
 */
async function review(page: Page, to: Address, amount: string, fee: RegExp) {
  await page.goto(`${APP}/send?to=${to}`);
  await page.getByLabel("Amount in USDC").fill(amount);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Send", exact: true }).waitFor(SLOW);
  const checked = page.locator("section").filter({ hasText: "Checked by Swissquote" });
  await checked.getByText(`Send ${Number(amount).toLocaleString("en-US")} USDC to ${to.slice(0, 6)}...${to.slice(-4)}.`, { exact: true }).waitFor(SLOW);
  await checked.getByText("Recipient not on a sanctions list").waitFor(SLOW);
  await checked.getByText("Simulated: it moves only this amount").waitFor(SLOW);
  const shown = page.locator("dl").filter({ hasText: "Network fee" }).locator("dd");
  await until(async () => fee.test(await shown.innerText()), `the network fee reads ${fee}`);
}

async function send(page: Page, to: Address, amount: string, fee = SPONSORED) {
  await review(page, to, amount, fee);
  await page.getByRole("button", { name: "Send", exact: true }).click(SLOW);
  await page.waitForURL("**/transaction-tracking?**", SLOW);
  await page.getByText("Completed").first().waitFor(SLOW);
}

/** The Swissquote client a phone linked its wallet as (mocked). */
const clientOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("swissquote.session") ?? "null")?.client as { number: string });

/** Creates a wallet on a fresh phone; resolves to its Recovery Key file. */
async function create(page: Page) {
  await page.goto(`${APP}/onboarding-welcome`);
  await page.getByRole("link", { name: "Create new wallet" }).click();
  await page.getByRole("button", { name: "Create Passkey" }).click(SLOW);
  await page.getByRole("button", { name: "Split Wallet Key" }).click(SLOW);
  const download = page.waitForEvent("download", SLOW);
  await page.getByRole("button", { name: "Save Recovery Key" }).click(SLOW);
  const kit = await (await download).path();
  await page.getByRole("button", { name: "I saved it off this phone" }).click(SLOW);
  await page.waitForURL("**/home", SLOW);
  return kit;
}

async function recover(page: Page, kit: string) {
  await page.goto(`${APP}/recover`);
  await page.locator("input[type=file]").setInputFiles(kit);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Restore with Face ID" }).click(SLOW);
  await page.getByText("Your wallet will be restored on").waitFor(SLOW);
}

console.log("1. Create, with no Swissquote account: passkey, split the wallet key 2-of-3, save the Recovery Key file and confirm it is kept off the phone");
const phone1 = await newPhone();
const kit = await create(phone1);
const wallet = (await walletOf(phone1)) as Address;
assert.equal(await clientOf(phone1), undefined, "creating a wallet signs in to nothing");
console.log(`   wallet ${wallet}`);
await swissquote.writeContract({ address: addresses.usdc, abi: parseAbi(["function mint(address, uint256)"]), functionName: "mint", args: [wallet, parseUnits("100", 6)] });
await publicClient.waitForTransactionReceipt({ hash: await swissquote.sendTransaction({ to: wallet, value: parseEther("0.01") }) });

console.log("2. Scan the friend's QR code to pick them, then send 20 USDC: Swissquote's reading of it and the fee in ETH, paid from the unlinked wallet, before Face ID; tracking shows it completed");
await phone1.goto(`${APP}/choose-recipient`);
await phone1.getByRole("button", { name: "Scan QR code" }).click();
await phone1.getByRole("dialog", { name: "Scan QR code" }).waitFor({ state: "detached", ...SLOW });
await phone1.getByRole("button", { name: "Continue" }).click();
await phone1.waitForURL(`**/send?to=${FRIEND}`, SLOW);
await send(phone1, FRIEND, "20", FROM_WALLET);
assert.equal(await usdcOf(FRIEND), parseUnits("20", 6));

console.log("3. 1,500 USDC leaves at once, like any payment: no amount waits, and the unlinked wallet pays its fee in ETH");
await swissquote.writeContract({ address: addresses.usdc, abi: parseAbi(["function mint(address, uint256)"]), functionName: "mint", args: [wallet, parseUnits("1500", 6)] });
await send(phone1, FRIEND, "1500", FROM_WALLET);
assert.equal(await usdcOf(FRIEND), parseUnits("1520", 6));

console.log("4. Settings offers to link a Swissquote account and says what it adds; Face ID links it, and Settings shows the client as linked");
await phone1.goto(`${APP}/settings`);
await phone1.getByRole("button", { name: "Link your Swissquote account" }).click(SLOW);
await phone1.getByText("Swissquote pays your network fees, so your wallet needs no ETH.").waitFor(SLOW);
assert.equal(await phone1.getByRole("dialog").getByText(/\bID\b/).filter({ hasNotText: "Face ID" }).count(), 0, "linking asks for no ID");
await phone1.getByRole("button", { name: "Link with Face ID" }).click();
await phone1.getByText("Swissquote account", { exact: true }).waitFor(SLOW);
const owner = await clientOf(phone1);
await phone1.getByText(`Client ${owner.number}`, { exact: true }).waitFor(SLOW);
assert.equal(await phone1.getByRole("button", { name: "Link your Swissquote account" }).count(), 0, "a linked wallet isn't offered the link again");

console.log("5. New phone: a Recovery Key no wallet uses is refused; the owner's goes straight to Face ID, though the wallet is linked");
const phone2 = await newPhone();
await phone2.goto(`${APP}/recover`);
await phone2.getByLabel("Recovery Key").fill(`0x${"7".repeat(64)}`);
await phone2.getByRole("button", { name: "Continue" }).click();
await phone2.getByText("This Recovery Key doesn't open a wallet").waitFor(SLOW);
await phone2.getByRole("button", { name: "Choose another file" }).click();
await phone2.locator("input[type=file]").setInputFiles(kit);
await phone2.getByRole("button", { name: "Continue" }).click();
await phone2.getByRole("button", { name: "Restore with Face ID" }).click(SLOW);
await phone2.getByText("Your wallet will be restored on").waitFor(SLOW);
console.log("   Swissquote cancels it for the user");
await phone2.getByRole("button", { name: "Cancel recovery" }).click();
await phone2.getByText("Recover your wallet").waitFor(SLOW);

console.log("6. Again; the old phone sees it on Home and cancels it with Face ID");
await recover(phone2, kit);
await phone1.goto(`${APP}/home`);
await phone1.getByText("Someone started recovering your wallet").waitFor(SLOW);
await phone1.getByRole("button", { name: "Cancel recovery" }).click(SLOW);
await phone1.getByText("Someone started recovering your wallet").waitFor({ state: "detached", ...SLOW });

console.log("7. Again; on the countdown the client locks the old phone with the Recovery Key: its Home says so, and how to stop the recovery if it isn't theirs; Send refuses");
await recover(phone2, kit);
await phone2.getByRole("button", { name: "Lock your old phone" }).click();
await phone2.getByText("Your old phone is locked").waitFor(SLOW);
await phone1.goto(`${APP}/home`);
await phone1.getByText("Swissquote locked this phone").waitFor(SLOW);
await phone1.getByText("call Swissquote or cancel it with your Recovery Key").waitFor(SLOW);
await phone1.getByRole("link", { name: "Cancel with Recovery Key" }).waitFor(SLOW);
await phone1.goto(`${APP}/send?to=${FRIEND}`);
await phone1.getByText("Swissquote locked this phone after it was reported lost.").waitFor(SLOW);
await phone1.getByLabel("Amount in USDC").fill("5");
assert.ok(await phone1.getByRole("button", { name: "Continue" }).isDisabled());

console.log("8. The 48-hour delay passes on the chain, the countdown follows it, then finish");
await warp(48 * 3600 + 10);
await phone2.getByRole("button", { name: "Finish recovery" }).click(SLOW);
await phone2.waitForURL("**/home", SLOW);

console.log("9. The new phone sends 5 USDC: same address, same balance");
await send(phone2, FRIEND, "5");
assert.equal(await walletOf(phone2), wallet);
console.log(`   friend has ${formatUnits(await usdcOf(FRIEND), 6)} USDC, the wallet ${formatUnits(await usdcOf(wallet), 6)} USDC`);

console.log("10. The old phone's Home says the wallet moved: the lock was on its old keys, so there's nothing to unlock");
await phone1.goto(`${APP}/home`);
await phone1.getByText("Your wallet moved to another phone").waitFor(SLOW);

console.log("11. The recovery signed the new phone in to nothing; Settings offers the link, and Face ID links it back to the same client");
assert.equal(await clientOf(phone2), undefined, "a recovery signs in to nothing");
await phone2.goto(`${APP}/settings`);
await phone2.getByRole("button", { name: "Link your Swissquote account" }).click(SLOW);
await phone2.getByRole("button", { name: "Link with Face ID" }).click();
await phone2.getByText(`Client ${owner.number}`, { exact: true }).waitFor(SLOW);
assert.deepEqual(await clientOf(phone2), owner, "signed in as the client who linked the wallet");

console.log("12. An unlinked wallet with no ETH: its recovery goes from the Recovery Key to Face ID the same way, on Swissquote's gas, and offers no lock; the new phone cancels it");
const phone3 = await newPhone();
const kit3 = await create(phone3);
const wallet3 = (await walletOf(phone3)) as Address;
const phone4 = await newPhone();
await phone4.goto(`${APP}/recover`);
await phone4.locator("input[type=file]").setInputFiles(kit3);
await phone4.getByRole("button", { name: "Continue" }).click();
await phone4.getByRole("button", { name: "Restore with Face ID" }).click(SLOW);
await phone4.getByText("Your wallet will be restored on").waitFor(SLOW);
assert.equal(await phone4.getByRole("button", { name: "Lock your old phone" }).count(), 0, "an unlinked wallet's phone can't be locked");
assert.equal(await clientOf(phone4), undefined, "the recovery signs the new phone in to nothing");
assert.equal(await publicClient.getBalance({ address: wallet3 }), 0n, "Swissquote paid for the recovery");
await phone4.getByRole("button", { name: "Cancel recovery" }).click();
await phone4.getByText("Recover your wallet").waitFor(SLOW);

console.log("13. Swissquote Plus is bought, not given: Home and Settings offer it, an unlinked wallet's /plus sends the client to link first, and the linked wallet buys it with Face ID");
await phone3.goto(`${APP}/plus`);
await phone3.getByRole("button", { name: "Link your Swissquote account" }).click(SLOW);
await phone3.waitForURL("**/settings", SLOW);
await phone3.getByRole("button", { name: "Link your Swissquote account" }).waitFor(SLOW);
await phone2.goto(`${APP}/home`);
await phone2.getByRole("link", { name: "Get more with Swissquote Plus" }).waitFor(SLOW);
await phone2.goto(`${APP}/settings`);
await phone2.getByText("Get Plus").waitFor(SLOW);
const swissquoteBefore = await usdcOf(addresses.swissquote);
await phone2.goto(`${APP}/plus`);
await phone2.getByRole("button", { name: "Subscribe with Face ID" }).click(SLOW);
await phone2.getByText("Welcome to Swissquote Plus").waitFor(SLOW);
await phone2.getByText("Plus runs until").waitFor(SLOW);
assert.equal(await usdcOf(addresses.swissquote), swissquoteBefore + parseUnits("10", 6), "the wallet paid Swissquote 10 USDC");
await phone2.goto(`${APP}/settings`);
await phone2.getByText("Swissquote Plus", { exact: true }).waitFor(SLOW);
assert.equal(await phone2.getByText("Get Plus").count(), 0, "a member isn't offered Plus again");
await phone2.goto(`${APP}/home`);
await phone2.getByRole("link", { name: "Welcome to Swissquote Plus" }).waitFor(SLOW);

await browser.close();
console.log("All good.");
