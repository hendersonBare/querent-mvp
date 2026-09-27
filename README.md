# Evidence: task 4.1 Customer quote PDF

Captured 2026-09-27 from `next start` (production build of `task/4.1-customer-quote-pdf`), seed date 2026-09-23.
Page 1 rendered to PNG at 150 dpi with PyMuPDF.

| File | Request | Who |
|---|---|---|
| `q24816-rev1.pdf`, `q24816-rev1-page1.png` | `GET /api/quotes/Q-24816/pdf?variant=customer` (latest sent revision, delivery, freight with miles) | Dana (customer) |
| `q24817-draft.pdf`, `q24817-draft-page1.png` | `GET /api/quotes/Q-24817/pdf?variant=customer&rev=draft` (seeded sample quote, ready_for_review, rep preview) | Brandi (rep) |

Dana asking for Q-24817 (unsent) gets `404 {"detail":"Quote not found."}`.
