# Fuse Wallet

Fuse started as a Solana crypto wallet and is becoming a broader finance app. Saving, earning, spending, investing and bank transfers live in one product. Stablecoins (USDC, PYUSD) are the default "cash". A paid tier, **Fuse Plus**, covers network fees, adds a bank account and a virtual Visa card. Identity verification is handled by **Bridge**. Bank payouts go to accounts such as Revolut over ACH.

This document is the full picture assembled from the 11 published references of the Fuse work (`references/`). Every screen below is rebuilt as its own route in this Next.js app, faithful to the references in layout, type, colour and motion, using the exact mock data they show. The goal is clean Next.js, Tailwind and Motion code, not a literal pixel match.

## Reference inventory

| Reference | What it shows | Length | Route |
| --- | --- | --- | --- |
| `02-onboarding.mp4` (0 to 4.5s) | Welcome carousel, Sign in with Apple sheet, Face ID | 24.7s total, 60fps | `/onboarding-welcome` |
| `02-onboarding.mp4` (4.5 to 24.7s) | Secure your wallet: Device Key, 2FA Key, Recovery Key, setup | | `/onboarding-secure` |
| `03-home-experience.mp4` | Wallet home, balance reveal, chart, asset tiles | 3.0s, 60fps | `/home` |
| `08-promo-cards.mp4` | Home grid bottom, promo card stack, dismiss and restore | 5.9s, 60fps | `/home` |
| `01-multi-action-interaction.mp4` | Home FAB expanding into Receive / Send / Swap | 2.5s, 60fps | `/home` |
| `11-coin-breakdown.mp4` | Coins tab, Solana row expanding into a breakdown | 4.0s, 60fps | `/coin-breakdown` |
| `05-address-input-field.mp4` | Choose recipient, .sol handle resolution | 4.0s, 60fps, 2156x2160 | `/choose-recipient` |
| `04-send-hide-my-wallet.mp4` | Send review, Hide My Wallet toggle morphing the CTA | 3.3s, 120fps | `/send-hide-my-wallet` |
| `06-transaction-tracking.mp4` | USDC withdrawal sheet, status stepper, details expand | 5.5s, 60fps | `/transaction-tracking` |
| `07-pending-verification.mp4` | Bridge identity verification, glass lens loop | 4.5s, 60fps | `/pending-verification` |
| `09-fuse-plus-membership.png` | Fuse Plus welcome / benefits (dark) | still, 2080x2080 | `/fuse-plus` |
| `10-fuse-cards-design.jpg` | Fuse card designs, white and black, embossed logo | still, 1600x1246 | not built |

Extracted material lives next to the originals:

- `references/frames/<name>/f_NNN.jpg` holds every frame at 720px wide. Short clips are sampled at 10fps (frame N is at `(N-1) * 100ms`). `02-onboarding` is sampled at 5fps (frame N is at `(N-1) * 200ms`).
- `references/sheets/<name>.jpg` is a 4x4 contact sheet spread evenly across each clip.
- Higher precision on demand: `ffmpeg -ss <t> -i references/<name>.mp4 -frames:v 1 out.png` gives a full-resolution frame at any timestamp.

The references are product-film shots. Phones are cropped, zoomed, and in two cases (07, 09) tilted in 3D. The app renders every screen flat as a real mobile web page, with no device mock: no bezel, no fake status bar, no Dynamic Island. Each route is a single mobile column (max 430px wide, full height) centred on desktop. Reproducing the UI, its data and its motion is the job.

## App map

The references describe one coherent product. Reading them together gives this flow.

1. **Onboarding.** A white welcome screen cycles through what Fuse does (Save, Earn, Spend, Invest, Pay) above a living blue gradient and the line "Your money, upgraded". Continue with Apple opens the native Sign in with Apple sheet. Face ID confirms. The app then floods blue and walks the user through three keys that secure a self-custodial wallet. Each key owns a colour: Device Key is blue, 2FA Key is orange, Recovery Key is purple. The Recovery Key asks for an email and a 6-digit code. A final white step sets the wallet up and confirms "Your wallet is ready!".
2. **Home (Wallet).** Total balance with a 24h change badge, a bar chart with a range picker, and a 2x2 grid of asset tiles: Cash, Investments, Earn, Card. A promo tile in the grid cycles Fuse Plus and Earn promos and can be dismissed. The bottom bar holds Home, History, Settings and a black "+" FAB. The FAB expands into Receive, Send and Swap.
3. **Coins.** The wallet has Dashboard, Coins and NFTs tabs. Coins lists holdings. Tapping a coin isolates it and reveals its Available / Staked / Earned breakdown.
4. **Send.** Choose recipient accepts a Solana address or a .sol handle, resolves it live, and lists recent addresses. The send review shows the destination wallet, covers onchain fees for Fuse Plus members, and offers Hide My Wallet, which morphs the primary button.
5. **Off-ramp.** A USDC withdrawal to a bank account is tracked in a sheet with a four-step status that collapses into a single Completed row. Details expand on demand.
6. **Verification.** While Bridge verifies identity, a glass lens wanders over an ID illustration.
7. **Fuse Plus.** A dark welcome screen lists the membership benefits. The physical/virtual Fuse cards come in white and black with an embossed Fuse mark.

## Design language

### Layout and chrome

- Design size is 393x852pt (iPhone 15 Pro). Every route is one mobile column: full width on phones, at most 430px wide and centred on desktop against the light grey of the films (`#f5f5f5`).
- No device chrome is drawn. The system moments in the references (Face ID in the Dynamic Island, the iOS keyboard and number pad) become in-app equivalents: a centred Face ID HUD, and native inputs with the right `inputMode`.
- Safe areas come from `env(safe-area-inset-*)` (the viewport uses `viewport-fit=cover`).

### Type

- SF Pro everywhere (system stack in `app/globals.css`). Numbers use tabular figures where they animate.
- Balances are large and tight: the home total is about 34pt bold with negative tracking.
- Secondary text is a soft grey. Tertiary text (helper lines, "No previous sends", fee labels) is a lighter grey.
- Currency motif: whole units are black and **cents are light grey** (`$23,531` + `.00`, `$3,327` + `.56`). This holds on every money value on home and promo screens.

### Colour

- Surfaces are white. Tiles and grouped containers are an almost-white grey with a hairline border and soft radius (around 20 to 24pt).
- Ink is black. Primary buttons are black pills with white text.
- Fuse blue (Hide My Wallet, progress, focus caret, active stepper) is a saturated electric blue. Positive values and success are iOS green. Negative values are red.
- Asset icons are small app-icon squircles: Cash is a blue USDC coin, Investments an orange dotted grid, Earn a purple bar chart, Card a black Visa chip.
- Action icons carry colour: Receive is an orange-red down arrow, Send a purple paper plane, Swap blue circular arrows.
- Onboarding owns the saturated colour: blue/cyan, orange/yellow, violet gradients that fade into white. These are produced with **Glimm** (WebGL colour band shader) rather than CSS gradients.

### Icons

Phosphor icons, `fill` or `duotone` weight (`@phosphor-icons/react`). Brand marks (Fuse logo, Apple, Visa, Bridge, Solana, USDC, PayPal USD, Jito, Jupiter, Tensor) are inline SVG drawn to match the references, since Phosphor does not ship them.

### Motion

The motion language is consistent across all references and is what makes the product feel expensive.

- **Blur as a transition material.** Elements enter from `blur + opacity 0 + slight scale or y offset` and leave the same way. Text swaps (balance digits, promo cards, CTA labels, menu items) cross-fade through blur instead of sliding.
- **Per-character reveals.** Money values type in left to right, each glyph sharpening from a blur. Values that change later roll their digits.
- **Springs, short and critically damped.** Nothing bounces visibly. Sheets, expanding rows and height changes use springs. Small state changes run in 150 to 300ms.
- **Stagger.** Lists, menu items, chart bars and tiles stagger in tens of milliseconds.
- **Physical controls.** The toggle knob stretches while pressed and settles with a spring. Buttons press down slightly.
- **Background recession.** When a layer opens (FAB menu, coin breakdown, sheets) the content behind it blurs and washes out instead of dimming to black.
- Everything respects `prefers-reduced-motion`.

## Screens

Timestamps refer to the original reference clip.

### 1. Onboarding: welcome and Sign in with Apple (`/onboarding-welcome`)

Reference: `02-onboarding.mp4`, 0 to 4.5s.

**Layout.** White screen. Upper third holds a vertical word wheel: the current word is large black with a small coloured icon (Spend with a purple card, Earn with orange bars, Save with a teal dot, Invest with a blue globe, Pay with a red bolt). The words above and below are faded. The lower half is a soft blue-to-cyan gradient field (Glimm) rising from the bottom. On it sits a small white Fuse logo tile, the headline "Your money, upgraded" in white, a two-line white caption ("Save, earn and invest / with stablecoins and digital assets"), a white pill "Continue with Apple" (Apple glyph) and a translucent pill "Recover existing wallet".

**Motion.** The word wheel auto-advances roughly every 0.5 to 0.7s, rolling up with blur on the outgoing and incoming words. The gradient breathes slowly.

**Sign in with Apple (1.0 to 4.5s).** Tapping Continue with Apple dims the screen to near-black and slides up the system sheet: header "Sign in with Apple" with a close button, the Fuse app icon, "Sign in to Fuse (development) using your Apple Account.", an account row with avatar "Volodymyr Huhuiev / Your account", and a blue "Sign In" button. Tapping Sign In swaps the button for a Face ID glyph. A Face ID HUD (rounded dark square) shows the green Face ID animation and check (in the film this happens in the Dynamic Island). The sheet shows a spinner "Signing in…", then a blue check "Done". The word wheel keeps rotating under the dim layer. The sheet slides down, the dim lifts, and the welcome screen returns. The flow then hands off to `/onboarding-secure`.

### 2. Onboarding: secure your wallet (`/onboarding-secure`)

Reference: `02-onboarding.mp4`, 4.5 to 24.7s.

**Entry (4.5 to 5.0s).** A blue band sweeps over the whole screen (Glimm) until it is fully saturated blue/cyan. A small white "Secure / your wallet" label sits top-left with a close button top-right.

**Device Key (5.0 to 8.0s).** The gradient recedes to the upper half and fades into white. Bottom content: blue scan icon, "Device Key" title, grey body "Your Device Key is protected by biometric verification — encrypted and stored on your phone.", and the pending steps below in light grey ("2FA Key", "Recovery Key"). Black pill "Create Device Key". Tap: label becomes a spinner plus "Creating Device Key", and the Face ID HUD confirms with a check.

**2FA Key (8.0 to 10.5s).** The gradient sweeps to orange/yellow. Device Key collapses into a completed grey row at the top of the list. New active step: orange cloud icon, "2FA Key", body "Your 2FA Key adds a second layer of protection — encrypted and stored in iCloud.". CTA "Create 2FA Key" with cloud icon, then "Creating 2FA Key".

**Recovery Key (10.5 to 18.5s).** The gradient sweeps to violet. Active step: purple envelope icon, "Recovery Key", body "Your Recovery Key helps you regain access to Fuse if you lose your phone.". An email field "Enter your email" with a circular arrow button. Focusing it lifts the content above the keyboard; the gradient fades to white. Typing `vova@sqds.io` (QuickType suggests an address) enables the arrow button (grey to black). Submitting swaps the body to "We've sent you a 6-digit code to vova@sqds.io", a "Resend (30s)" pill counting down, and a six-slot code row (native numeric input). Digits `1 3 4 9 6 5` fill in one by one with a caret. On completion the keyboard drops and the violet gradient briefly returns.

**Setup (18.5 to 24.7s).** Screen goes white. All three keys appear as completed grey rows. A new row with a spinner ring reads "Setting up your wallet / Hold tight while we're getting your wallet ready.". The Face ID HUD confirms once more. The spinner becomes a green dot and the copy becomes "Your wallet is ready! / You now have safe place for your money.".

### 3. Home (`/home`)

References: `03-home-experience.mp4` (top of screen), `08-promo-cards.mp4` (bottom of the grid), `01-multi-action-interaction.mp4` (FAB). The three clips show different data snapshots of the same screen. The route builds one coherent Home: the data of clip 03 for the header, chart and tiles, the promo stack of clip 08 in the grid, and the FAB menu of clip 01.

**Layout (clip 03).** "Wallet" title top-left (15pt semibold). "Total Balance" in grey with a green badge (small green square with an up-right arrow, then `1.22%`). Balance `$23,531.00` with grey cents. A bar chart of about 60 thin grey bars with a dotted baseline. Range picker `1D 1W 1M 6M 1Y`, `6M` selected in a light grey pill. 2x2 tiles, each with an icon top-left and label plus value bottom-left: Cash `$5,000.00`, Investments `$7,531.00`, Earn `$10,000.00`, Card `$1,000.00`.

**Load motion (clip 03, 0 to 1.5s).** The balance types in character by character with blur (`$2` → `$23,5` → `$23,531` → `$23,531.00`). The chart grows from the dotted baseline, bars rising left to right. Tile values type in with the same blur reveal, staggered across tiles.

**Promo cards (clip 08).** Grid data: Cash `$3,327.56`, Investments `$2,316.88` (ticks to `$2,318.52` with a digit roll), Earn `$3,016.67`. The fourth tile is a promo stack with two page dots and a close ×: "Welcome to Fuse Plus" (black Fuse icon) and "Earn up to 5.45% APY" (blue Fuse icon). Cards auto-advance with a blur cross-fade, the icon swapping first and the copy following. Dismissing with × blurs the card out. Once none remain the tile shows a glasses icon and "Tap to bring back the promo cards" in light grey with a dashed border. Tapping restores the stack with a blur-in. Bottom bar: Home (filled black), History (grey clock), Settings (grey gear), and the black "+" FAB on the right.

**Multi-action (clip 01).** Data: a tile reading `$3,498.41`, a promo "Earn up to 7.80% APY", left-column values ending `.25` and `5.75`. Tapping "+" blurs and washes out the whole screen, the FAB collapses, and a right-aligned menu rises from its position: "Receive" (orange-red arrow down), "Send" (purple paper plane), "Swap" (blue arrows). Labels sit left of their icons, about 17pt. Items enter staggered with blur and a small scale. Tapping outside reverses it: items fold back into the FAB and the background sharpens.

### 4. Coin breakdown (`/coin-breakdown`)

Reference: `11-coin-breakdown.mp4`.

**Layout.** Frosted light grey screen with a faint blue glow. Header: grey Fuse logo tile, "Wallet ⌄", address `7k4r...23et` with copy icon, history icon top-right. Tabs "Dashboard", "Coins" (active, underline), "NFTs". Holdings, each with a coin logo, name, amount, value, and 24h change:

| Coin | Amount | Value | Change |
| --- | --- | --- | --- |
| Solana | 80.06 SOL | $10,400.00 | +$513.00 |
| USD Coin | 6,000.00 USDC | $6,000.00 | |
| PayPal USD | 3,000.00 PYUSD | $3,000.00 | |
| Jito | 575.04 JTO | $1,100.00 | +$14.00 |
| Jupiter | 1,420.01 JUP | $994.00 | +$12.00 |
| Tensor | 3,200.00 TNSR | $992.00 | -$2.00 |

**Motion.** Tapping Solana fades and blurs the header, the tabs and every other row, while the Solana row stays put. A progress bar grows under it (blue segment around 75%, light grey remainder) and the breakdown staggers in: blue dot "Available" `50.06 SOL`, grey dot "Total Staked" `30.00 SOL`, dashed divider, "Staked" `25.00 SOL`, "Earned" `+ 5.00 SOL` in green. Tapping again reverses it.

### 5. Choose recipient (`/choose-recipient`)

Reference: `05-address-input-field.mp4`.

**Layout.** A modal sheet over a grey backdrop, rounded top corners near the top of the screen. Title "Choose recipient" centred, scan icon (four corners) top-right. An elevated white input card with a soft shadow: placeholder "Address or .sol handle", helper "Enter Solana address or .sol handle", a disabled grey "Continue" pill and a "Paste" pill with a document icon. Below: "Recent addresses" and one row with a wallet icon, `ECmf...iNd6`, "No previous sends".

**Motion.** Focus shows a blue caret. Typing `toly` → `toly.s` → `toly.sol` reveals a grey clear button. The helper line swaps through blur to a spinning blue gear "Resolving...", then to a green check with `86xC...2MMY`. Continue turns black and enabled at the same moment.

### 6. Send with Hide My Wallet (`/send-hide-my-wallet`)

Reference: `04-send-hide-my-wallet.mp4` (120fps, toggle physics worth stepping frame by frame).

**Layout.** Destination row: avatar (orange basketball on grey), "Solana wallet" / "Ledger", "4 sends" pill. Dashed divider. "Onchain fees" left in grey, "Fuse⁺ Covered" right with "Covered" in green. Empty space. Bottom: blue half-filled shield, "Send with Hide My Wallet" / "How it works? ⓘ", and a toggle. Full-width pill CTA with a scan glyph.

**Motion.** Toggle on: the knob stretches into a wide pill while travelling, the track fills Fuse blue, the CTA background cross-fades black to blue and its label grows from "Send" to "Send with Hide My Wallet" (button width is fixed, new words blur in). Toggle off reverses it: track back to grey, CTA to black, the extra words blur out.

### 7. Transaction tracking (`/transaction-tracking`)

Reference: `06-transaction-tracking.mp4`.

**Layout.** A floating rounded sheet (light grey) over a blurred, darkened app. Close × top-right. USDC coin with a small bank badge, "USDC Withdrawal", `1,508.50 USDC`, "11 March 2025 at 10:07". Status container: "Status" with "Copy details ⧉" and a vertical four-step tracker: Awaiting Crypto (done), Received Crypto (done), Payout on the way (active, blue), Completed (pending). Rows: To `Revolut ••••1342`, Account owner name `Thomas A. Anderson`, Transfer fee `$8.50`. "Show details" button.

**Motion.** The active step advances to Completed. The tracker collapses upward into a single "Status · Completed ✓" row in green and the sheet shrinks with a spring, anchored to the bottom. "Show details" expands extra rows after a dashed divider: Payment rail `ACH Same Day`, Onchain transaction `3W4g...z5xH ⧉`, Network fee `⚡ Free` in green. The label becomes "Hide details" and collapsing reverses it.

### 8. Pending verification (`/pending-verification`)

Reference: `07-pending-verification.mp4` (tilted in the film; build flat).

**Layout.** Light grey screen. Illustration: a grey ID photo card with a portrait silhouette, a second frame offset behind it. Below: Bridge logo and "Bridge", "is verifying your identity" (about 20pt semibold), grey centred body "Verification can take up to 3 business days. If you haven't received a response after this time, contact support@bridge.xyz.".

**Motion.** A glass magnifier lens (clear disc, thin bright rim, inner shadow, refraction of what is under it) drifts around the ID card on a smooth closed loop, about 4.5s per cycle, passing top-right, top-left, centre and bottom-right.

### 9. Fuse Plus membership (`/fuse-plus`)

Reference: `09-fuse-plus-membership.png` (tilted in the render; build flat).

**Layout.** Dark screen: a slate-blue glow at the top fading to near-black. A glowing white "+" with a soft halo. "Welcome to Fuse Plus" (white, about 28pt semibold) and grey "Your membership to earn more, pay less, and access premium benefits.". A dark rounded card with three benefits, each with an icon, white title and grey body:

- Green bolt. "Free Transactions". "Use Fuse without paying Solana network fees."
- Red bank. "Bank Account". "Receive payments from anyone with a bank account for a 0.1% conversion fee"
- VISA wordmark. "Fuse Card". "A virtual Visa debit card to spend stablecoins anywhere, with zero fees."

A divider, then a dashed-square icon and "More features are coming soon".

**Motion (inferred, the reference is a still).** The "+" glow breathes and content enters with the house blur stagger.

## Implementation conventions

- **Stack.** Next.js 16.4 App Router, React 19, TypeScript strict, Tailwind CSS v4, `motion` (`motion/react`), `@phosphor-icons/react` (fill / duotone), `glimm` (onboarding gradients). This Next.js version differs from older training data; read `node_modules/next/dist/docs/` before relying on an API.
- **Ownership.** Each screen lives entirely in `app/<route>/`: `page.tsx`, a `_components/` folder, and a `data.ts` holding the mock data copied from the reference. Shared code is only `app/globals.css` and `app/layout.tsx`.
- **Behaviour.** Interactions are real (tap, type, toggle, dismiss). Asynchronous steps the references show (handle resolution, status progress, Face ID) are simulated with mock delays.
- **Navigation.** Routes link to each other where the flow implies it: onboarding ends on `/home`, the FAB's Send opens `/choose-recipient`, Continue leads to `/send-hide-my-wallet`, the Fuse Plus promo opens `/fuse-plus`.
- **Checking.** `node scripts/shot.mjs <route> <out.png>` screenshots a route in a 393x852 mobile viewport against the running dev server, with `--step` actions and `--frames/--interval` bursts for motion. Screenshots go to `shots/` (git-ignored).
