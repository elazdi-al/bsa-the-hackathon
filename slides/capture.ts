// Captures app screens for the slides' phones: an iPhone 15 Pro (393 × 852 at 3x) with its safe areas,
// so content sits below the status bar the deck draws on top. Run next to `npm run dev`:
//   node slides/capture.ts home onboarding-secure   writes slides/screens/home.png, …
import { chromium } from 'playwright'

const APP = process.env.API_URL ?? 'http://localhost:3000'

const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } })

for (const route of process.argv.slice(2)) {
  await page.goto(`${APP}/${route}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: new URL(`screens/${route}.png`, import.meta.url).pathname })
}
await browser.close()
