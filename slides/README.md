# Shamir transactions and recovery presentation

Open [index.html](index.html) directly in a browser. The deck has 14 slides and uses a plain white layout, Fuse typography, and a 16:9 format. It does not require the wallet services to run.

The presentation follows the decisions in order:

1. A lost phone motivates 2-of-3 Shamir sharing.
2. Colluding holders of B and C motivate a passkey on every transaction.
3. Collusion during recovery and impersonated requests motivate a separate secret Recovery Key.
4. Theft of the Recovery Key motivates a 48-hour on-chain delay with a chance to cancel.

Each slide contains one short statement, at most one small visual, and one optional caption. Share holders, signing, recovery authorization, the waiting period, and finalization are spread across separate steps. Full protocol details remain in speaker notes.

## Present

- Arrow keys, Space, PageUp, or PageDown move between slides.
- Home and End jump to the first or last slide.
- Click on the right to advance or on the left third to go back. Horizontal swipes work on touch screens.
- N toggles speaker notes. F toggles fullscreen.
- Hover at the bottom right or press Tab to reveal navigation, notes, and fullscreen controls.
- Append a slide number to the URL, such as `index.html#4`, to open that slide.
- Print or save as PDF for one 16:9 page per slide. Controls and speaker notes are omitted from the exported pages.

Speaker notes explain the implementation details and security limits behind each slide, including the need to detect and cancel a fraudulent recovery in time. Production recovery alerts are not implemented. The deck distinguishes Share C from the separate Recovery Key and states that this build reconstructs the full Wallet Key on the phone before signing.

Source material: [pitch summary](../PITCH_SUMMARY.md), [protocol](../protocol.md), and [technical guide](../docs/SHAMIR_AND_RECOVERY.md).
