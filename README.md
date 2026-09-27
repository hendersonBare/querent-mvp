# 3.5 evidence: the quote detail's ⋯ menu

Screenshots from `e2e/rep-more-menu.spec.ts` (branch `task/3.5-more-menu`, head de816c0), production build, scripted mode, seed date 2026-09-23.

| File | What it shows |
|---|---|
| `3.5-1440.png` | Q-24817 at 1440px with the ⋯ menu open: Duplicate quote, Open customer in ERP (disabled), a divider, Reset sample quote. No Reassign (compare `docs/design/screens/06-more-menu.png`). |
| `3.5-1440-erp-tooltip.png` | Hovering Open customer in ERP: the tooltip "Available after ERP integration", beside the menu. |
| `3.5-390.png` | 390px: the menu opens under the actions row and fits the screen. |
| `3.5-390-erp-tooltip.png` | 390px: a tap on Open customer in ERP shows the tooltip under the item. |
| `3.5-duplicated.png` | After Duplicate quote: the copy (a new ready_for_review quote) opens with ?customer= kept and the toast "Duplicated Q-24817 as Q-24822". The bolts price edited just before ($33.00) is in the copy. |
| `3.5-reset.png` | After Reset sample quote (following a price edit, a removed line and an added line): Q-24817 is back to its seed lines and $1,122.40, with the toast "Sample quote reset". |
