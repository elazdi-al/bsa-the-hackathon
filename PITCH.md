# Pitch deck

Open [public/pitch.html](public/pitch.html) directly in a browser. It is a single HTML file with embedded styles and JavaScript. It works offline and has no external fonts, images or dependencies.

With the app running through `bun dev`, visit **http://localhost:3000/pitch.html**. The deck's prototype link opens the existing onboarding screen when served by the app.

There are ten pitch slides, followed by two Q&A slides. The speaker notes suggest a roughly five-minute presentation. The content follows [PROPOSAL.md](PROPOSAL.md) and distinguishes the current Fuse UI prototype from the proposed Swissquote wallet and testnet demo. Update slide 9 as integration work ships.

| Control | Action |
| --- | --- |
| Right arrow, Space, Page Down | Next slide |
| Left arrow, Page Up | Previous slide |
| Home / End | First / last slide |
| O or Slides | Open slide picker |
| N or Notes | Toggle speaker notes |
| F or Full screen | Toggle full screen where supported |
| P or PDF | Print or save as PDF |
| Escape | Close slide picker or notes |
| Horizontal swipe | Change slides on touch devices |

Link to a specific slide with a fragment such as `pitch.html#slide-4`. Presentation controls and notes are excluded from printing. All twelve slides print, one per page, in a 16:9 layout. Enable background graphics in the browser print dialog to preserve the colors.

Edit each `<section class="slide">` in the HTML to change slide content. Its `data-title` appears in the slide picker, and `data-notes` contains the speaker notes. This deck uses product and architecture assumptions from the proposal, rather than external market statistics or confirmed legal conclusions.
