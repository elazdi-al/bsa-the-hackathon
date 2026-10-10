// Screenshot a route in a mobile viewport (393x852 unless --size), optionally after scripted steps, optionally as a timed frame burst.
//
//   node scripts/shot.mjs <route> <out.png> [options]
//
//   --scale <n>                  deviceScaleFactor (default 2)
//   --size <w>x<h>               viewport (default 393x852)
//   --step <action>              repeatable, run in order after load:
//                                  wait:<ms> | click:<selector> | hover:<selector>
//                                  type:<selector>:<text> | press:<key> | tap:<x>,<y>
//   --frames <n> --interval <ms> capture n frames after the steps; files are named <out>-<elapsedMs>ms.png
//   --base <url>                 default http://localhost:3000

import { chromium } from "playwright";

const argv = process.argv.slice(2);
const [route, out] = argv;
if (!route || !out) {
  console.error("usage: node scripts/shot.mjs <route> <out.png> [--scale n] [--step ...] [--frames n --interval ms]");
  process.exit(1);
}

const opts = { scale: 2, size: "393x852", steps: [], frames: 0, interval: 100, base: "http://localhost:3000" };
for (let i = 2; i < argv.length; i += 2) {
  const [flag, value] = [argv[i], argv[i + 1]];
  if (flag === "--step") opts.steps.push(value);
  else if (flag === "--scale") opts.scale = Number(value);
  else if (flag === "--size") opts.size = value;
  else if (flag === "--frames") opts.frames = Number(value);
  else if (flag === "--interval") opts.interval = Number(value);
  else if (flag === "--base") opts.base = value;
  else throw new Error(`unknown flag ${flag}`);
}

const browser = await chromium.launch();
const [width, height] = opts.size.split("x").map(Number);
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: opts.scale, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(new URL(route, opts.base).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

for (const step of opts.steps) {
  const [action, ...rest] = step.split(":");
  const arg = rest.join(":");
  if (action === "wait") await page.waitForTimeout(Number(arg));
  else if (action === "click") await page.locator(arg).first().click();
  else if (action === "hover") await page.locator(arg).first().hover();
  else if (action === "press") await page.keyboard.press(arg);
  else if (action === "type") {
    const [sel, ...text] = arg.split(":");
    await page.locator(sel).first().pressSequentially(text.join(":"), { delay: 90 });
  } else if (action === "tap") {
    const [x, y] = arg.split(",").map(Number);
    await page.mouse.click(x, y);
  } else throw new Error(`unknown step ${step}`);
}

if (opts.frames > 0) {
  const stem = out.replace(/\.png$/, "");
  const start = performance.now();
  for (let i = 0; i < opts.frames; i++) {
    const elapsed = Math.round(performance.now() - start);
    await page.screenshot({ path: `${stem}-${String(elapsed).padStart(5, "0")}ms.png`, animations: "allow" });
    const next = start + (i + 1) * opts.interval;
    const wait = next - performance.now();
    if (wait > 0) await page.waitForTimeout(wait);
  }
} else {
  await page.screenshot({ path: out, animations: "allow" });
}

if (errors.length) console.error(`page errors:\n${errors.join("\n")}`);
await browser.close();
console.log(opts.frames ? `captured ${opts.frames} frames` : `wrote ${out}`);
