// Writes the App Store screenshots in store.html to slides/store/<n>-<name>.png at 1290 × 2796.
//
//   node slides/store.ts
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = new URL("store/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1290, height: 2796 } });
await page.goto(new URL("store.html", import.meta.url).href, { waitUntil: "networkidle" });
await page.addStyleTag({ content: ".gallery { zoom: 1; padding: 0; gap: 0; }" });
await page.evaluate(() => document.fonts.ready);
const panels = page.locator(".panel");
for (let n = 0; n < (await panels.count()); n++) {
  const panel = panels.nth(n);
  const file = `${String(n + 1).padStart(2, "0")}-${await panel.getAttribute("data-name")}.png`;
  await panel.screenshot({ path: out + file });
  console.log(`   ${file}`);
}
await browser.close();
