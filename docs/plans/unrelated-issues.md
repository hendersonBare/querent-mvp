# Unrelated issues

Issues noticed during the v3 build that are outside its scope. Not fixed here.

| Where | Issue |
|---|---|
| `next-env.d.ts` | `npm run build` rewrites the import paths (`.next/dev/types` → `.next/types`) and `next dev` writes them back, so the tracked file flips between builds. Agents revert it before committing. |
| `src/components/rep/orders/OrderDetail.tsx`, `src/server/db/seed/insert.ts`, `src/server/pricing/engine.ts` | Further private rounding helpers (`round2`, `cents`) beyond the three decision 7 names; left as-is. |
| `README.md` (Local Chromium override) | Says to edit `playwright.config.ts` locally; a git-excluded `playwright.local.config.ts` wrapper is safer. |
| `docs/codebase-structure.html` | Mentions old Notion task numbers in an archived analysis. |
