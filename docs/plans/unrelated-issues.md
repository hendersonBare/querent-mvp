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
