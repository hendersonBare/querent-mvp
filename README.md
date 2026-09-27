# Task 4.2 evidence: internal worksheet PDF

These PDFs were rendered by `internalWorksheet()` + `renderInternalWorksheetPdf()` from branch
`task/4.2-internal-worksheet-pdf`, on the seed for 2026-09-23 (the mockup's day). The route serves the same
bytes at `GET /api/quotes/:id/pdf?variant=internal&rev=…` (rep only). PNGs are rendered at 150 dpi with PyMuPDF.

| File | What it shows |
|---|---|
| `int-17-draft-page1.png` / `-page2.png` / `.pdf` | Seeded Q-24817 as a live draft (`rev=draft`), with one internal note. Page 1 has the banner, the customer frame, each line's basis, cost, margin and floor, Querent's pick, last paid and Why this price?, the red below-floor line (gloves, 26.6% under Brandi's 30% Safety & PPE floor), profit and totals. Page 2 has account and credit (37% used, 39% with this quote), the internal notes, Before sending, the as-of note, terms and the rep. |
| `int-17-rev1-sent-page1.png` / `-page2.png` / `.pdf` | Q-24817 rev 1 after the send, a change request, a reprice of the bolts to $29.99 and the removal of the straps line. It still prints rev 1 as sent (10 at $31.50, total $1,184.90). The straps cost `$14.20*` is the item's current cost, marked in the as-of note. |
| `int-17-rev2-draft-page1.png` / `.pdf` | The rev 2 draft with those edits: 20 at a custom $29.99 (28.6%), with "Querent suggested Last paid $31.50." |
| `int-16-page1.png` / `.pdf` | Seeded Q-24816 rev 1 (accepted): contract lines, gloves at a custom $79.00 below floor, and last paid as of the send date ($78.00 on May 5, not the later $79.00). |
| `customer-16-page1-unchanged.png` | The customer PDF of Q-24816. Its text and page-1 pixels are identical before and after this branch's shared-frame refactor. |
