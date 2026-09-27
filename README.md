# 3.4 Quote detail side panels: evidence

Screenshots from `next start` (production build) on the branch `task/3.4-side-panels`. The server ran in scripted mode with the seed pinned to the mockup's day (`QUERENT_SEED_DATE=2026-09-23`) and the E2E fixture quotes. Compare them with `docs/design/screens/03`, `04` and `08`.

| File | What it shows |
|---|---|
| `01-1440-closed.png` | Screen 03 layout: the five panels closed under the summary card, each with its one-line value |
| `02-1440-open.png`, `03-1440-rail-open.png` | Every panel open. Customer (copy phone, facts, credit bar), Pickup or delivery, Quote terms, Internal notes, Activity |
| `04-1440-delivery-distance-freight.png` | Switched to delivery: freight $62.50 with road miles and the formula |
| `05-1440-override-reason-required.png` | Set freight by hand: the reason is required |
| `06-1440-override-terms-note-activity.png` | Override saved ($80.00, reason, distance-based $62.50), PO 7781, internal note, Activity newest first |
| `07-1440-credit-over-limit.png`, `08-1440-over-limit-page.png` | Over the credit limit: the grey stops at 100%, the end is red, "Over limit by $5,306.40". Approve & send stays enabled |
| `09-1440-sent-read-only.png` | A sent quote: the panels are read-only |
| `10-390-closed.png`, `11-390-open.png` | Screen 08 at 390px: the panels stack under the summary card, with no sideways scroll |
