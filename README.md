# Task 3.2 Quotes list: screenshots

Taken from a production build (`next start`) with the seed pinned to 2026-09-23 (`QUERENT_SEED_DATE`). After `POST /api/test/reset`, `POST /api/test/rep-quotes` added a changes_requested quote (Q-24818), a sent quote (Q-24819), an overdue sent quote that lists as Expired (Q-24820) and a quote for Mara's customer (Q-24821).

| File | What it shows |
|---|---|
| `list-1440.png` | The rep's full list at 1440px: the status filter with counts, the Q-24818 changes_requested row highlighted with Dana's note, unread dots, draft totals and below-floor notes. Mara's Q-24821 is not listed. |
| `changes-1440.png` | `?status=changes_requested` |
| `greatbasin-1440.png` | The empty state for a placeholder customer (Great Basin) |
| `canyon-1440.png` | Another rep's customer (Canyon Ridge, Mara Jensen's) |
| `detail-1440.png` | The `/rep/quotes/Q-24817` placeholder after opening. The Quotes badge dropped from 2 to 1. |
| `list-390.png` | The list at 390px, where each quote is a card |
| `greatbasin-390.png`, `canyon-390.png`, `detail-390.png` | The same screens at 390px |
