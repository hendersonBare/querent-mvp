# Task 7.1 evidence: visual pass and mobile pass

Captured from the `task/7.1-final-checks` build (production server, scripted chat, seed pinned to
2026-09-23, the mockup's day) on 2026-09-27.

## Visual pass: side by side with `docs/design/screens/`

Mockup on the left, build on the right.

| File | Screen |
|---|---|
| `visual/side-by-side-03-quote-detail.png` | 03 Quote detail, cost hidden |
| `visual/side-by-side-04-quote-detail-show-cost.png` | 04 Quote detail, Show cost on |
| `visual/side-by-side-05-export-menu.png` | 05 Export menu |
| `visual/side-by-side-06-more-menu.png` | 06 ⋯ menu |
| `visual/side-by-side-07-send-dialog.png` | 07 Approve & send dialog |
| `visual/side-by-side-08-quote-detail-mobile.png` | 08 Quote detail at 390px (full page) |

Every difference is either fixed on the branch or listed in `docs/design/README.md` (Intentional
differences, and Sample data, not layout). The one open item is the seeded Q-24817 total
($1,122.40 from the pricing engine vs the mockup's $1,109.50), which waits on Henderson's decision.

`build/` holds the build's own captures: the six screens above, Confirm send (`07b`), and screens
the mockup doesn't cover: the Quotes list, Analytics, Settings, the customer chat, the PDF preview
modal and the customer chat at 390px.

## Mobile pass: the quote flow at 390×844

`mobile/` holds the screenshots `e2e/mobile-flow.spec.ts` saves as Dana and Brandi walk steps 1–8
on phones: the clarifying buttons, the item pop-up, the quote detail and its panels, the send
dialog and Confirm send, the PDF preview, Request changes and Accept with their Confirm dialogs,
and the accepted quote. The spec presses every action without force after checking it is wholly on
screen, and fails if any page, dialog, sheet, menu or listbox scrolls sideways.
