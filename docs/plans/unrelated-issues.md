# Unrelated issues

Issues noticed during the v3 build that are outside its scope. Not fixed here.

| Where | Issue |
|---|---|
| `next-env.d.ts` | `npm run build` rewrites the import paths (`.next/dev/types` → `.next/types`) and `next dev` writes them back, so the tracked file flips between builds. Agents revert it before committing. |
| `src/components/rep/orders/OrderDetail.tsx`, `src/server/db/seed/insert.ts`, `src/server/pricing/engine.ts`, `src/server/freight/quote.ts:17`, `src/server/chat/tools.ts:206`, `src/server/analytics/metrics.ts:25`, `src/server/upsells/rules.ts:105` | Further private rounding helpers (`round2`, `cents`) beyond the three decision 7 names; left as-is. |
| `README.md` (Local Chromium override) | Says to edit `playwright.config.ts` locally; a git-excluded `playwright.local.config.ts` wrapper is safer. |
| `docs/codebase-structure.html` | Mentions old Notion task numbers in an archived analysis. |
| `src/server/db/migrate.ts` | Each open takes one write lock per migration file even when applied, and the per-file `foreign_key_check` covers the whole database (a pre-existing bad row would block later migrations). Negligible today. |
| `src/server/repository/chat.ts` | Message order relies on SQLite `rowid` as the tie-break for equal `created_at` (pre-existing in `conversationMessages`); a future `messages` rebuild or VACUUM could reorder same-millisecond messages. |
| `npm run typecheck` | Does not cover `e2e/*.ts`; `next build` does, so a spec type error shows only at build time. |
| Playwright runs | The agent proxy logs blocked requests to `www.google.com:443` (likely a font/asset fetch); tests unaffected. |
| `src/server/freight/quote.ts` (`deliveryMiles`) | Rebuilds the ship-to address string that the repository also builds; the two could drift. |
| Send / draft PDF / quote list | Do not reprice a draft; if the toggle flips while a rep has a draft open, Send uses the recovery shown at last open (by design, OA-48). |
| `src/server/rep/quote-upsells.ts:128` | Taking a stale upsell chip (refused 409) still stamps `last_rep_touch_at`; negligible because opening the page already touched it. |
| `src/app/api/session/route.ts` | `POST /api/session {"persona":"toString"}` returns 500 and `__proto__` sets an ignored cookie (`in` instead of `Object.hasOwn`); harmless. |
| `src/app/api/query/[...path]/route.ts:14-15` | `/api/query/me` and `/api/query/erp/status` still answer an inactive rep (low-sensitivity data). |
| `src/server/rep/team.ts`, `TeamReps.tsx` | `plural()` and the 40-char team label limit are duplicated client/server. |
| Reset sample quote | Resetting Q-24817 after it was reassigned returns it to Brandi and drops its reassignment activity (delete + re-insert). Demo-only. |
