# Shamir transactions and recovery presentation

Open [index.html](index.html) directly in a browser. The deck has 12 slides and uses the existing Fuse typography, blue gradient, and 16:9 format. It does not require the wallet services to run.

The presentation covers share holders, Shamir reconstruction, separate payment and recovery authorization, wallet creation, the normal transaction flow, colluding share holders, lost-phone recovery, the 48-hour on-chain delay, finalization, and prototype limitations.

## Present

- Arrow keys, Space, PageUp, or PageDown move between slides.
- Home and End jump to the first or last slide.
- Click on the right to advance or on the left third to go back. Horizontal swipes work on touch screens.
- N toggles speaker notes. F toggles fullscreen.
- The controls at the bottom provide navigation, notes, and fullscreen buttons.
- Append a slide number to the URL, such as `index.html#8`, to open that slide.
- Print or save as PDF for one 16:9 page per slide. Controls and speaker notes are omitted from the exported pages.

Speaker notes explain the implementation details and security limits behind each slide. The deck distinguishes Share C from the separate Recovery Key and states that this build reconstructs the full Wallet Key on the phone before signing.

Source material: [pitch summary](../PITCH_SUMMARY.md), [protocol](../protocol.md), and [technical guide](../docs/SHAMIR_AND_RECOVERY.md).
