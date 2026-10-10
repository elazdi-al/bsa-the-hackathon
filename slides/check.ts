// Screenshots every slide at 1920×1080, flags text that leaves its slide or card or overlaps other text, and prints the
// deck to PDF to check it gives one page per slide.
//
//   node slides/check.ts [out-dir]      (default /tmp/slides)
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const out = process.argv[2] ?? "/tmp/slides";
mkdirSync(out, { recursive: true });
const deck = new URL("index.html", import.meta.url).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(deck, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const count = await page.locator(".slide").count();
let problems = 0;

for (let n = 1; n <= count; n++) {
  await page.goto(`${deck}#${n}`);
  await page.waitForTimeout(150);
  const spills = await page.evaluate(() => {
    const slide = document.querySelector(".slide.current")!;
    const edge = slide.getBoundingClientRect();
    const boxed = (el: Element) => {
      const css = getComputedStyle(el);
      return css.backgroundColor !== "rgba(0, 0, 0, 0)" || css.backgroundImage !== "none" || css.boxShadow !== "none" || css.outlineStyle !== "none";
    };
    const lines: { rect: { left: number; right: number; top: number; bottom: number }; node: Text }[] = [];
    const found: string[] = [];
    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      const parent = node.parentElement!;
      // Phones bleed off the edge on purpose, and notes are hidden.
      if (!node.data.trim() || parent.closest(".phone, .notes, .tag")) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const label = `"${node.data.trim().slice(0, 40)}"`;
      let box: Element | null = parent;
      while (box && box !== slide && !boxed(box)) box = box.parentElement;
      const frame = (box ?? slide).getBoundingClientRect();
      // A line's rect spans the font's whole ascent and descent; its ink sits between cap height and baseline.
      const inset = parseFloat(getComputedStyle(parent).fontSize) * 0.24;
      for (const rect of range.getClientRects()) {
        if (!rect.width) continue;
        lines.push({ rect: { left: rect.left, right: rect.right, top: rect.top + inset, bottom: rect.bottom - inset }, node });
        if (rect.left < edge.left || rect.right > edge.right || rect.top < edge.top || rect.bottom > edge.bottom) found.push(`outside the slide: ${label}`);
        // Line boxes may poke a few pixels past their card with tight leading; text past that has escaped it.
        else if (rect.left < frame.left - 2 || rect.right > frame.right + 2 || rect.top < frame.top - 8 || rect.bottom > frame.bottom + 8) found.push(`outside its card: ${label}`);
      }
    }
    for (const [i, a] of lines.entries()) {
      for (const b of lines.slice(i + 1)) {
        if (a.node === b.node) continue;
        const w = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const h = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (w > 4 && h > 4) found.push(`text overlaps: "${a.node.data.trim().slice(0, 30)}" and "${b.node.data.trim().slice(0, 30)}"`);
      }
    }
    return [...new Set(found)];
  });
  const file = `${out}/${String(n).padStart(2, "0")}.png`;
  await page.screenshot({ path: file });
  console.log(`${file}${spills.length ? "" : "  ok"}`);
  for (const s of spills) console.log(`   ${s}`);
  problems += spills.length;
}

const pdf = `${out}/deck.pdf`;
await page.goto(deck, { waitUntil: "networkidle" });
await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
const pages = Number(execFileSync("pdfinfo", [pdf], { encoding: "utf8" }).match(/^Pages:\s+(\d+)/m)?.[1]);
console.log(`${pdf}: ${pages} pages for ${count} slides${pages === count ? "  ok" : ""}`);
await browser.close();
if (problems || pages !== count) process.exit(1);
