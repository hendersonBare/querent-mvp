# E2E suite (Playwright)

The browser tests for the BOXT quote tool (`docs/boxt/plan.md`, task B8). They run the **production
server** against the **local Supabase stack** with the **scripted parser and judge** (`QUERENT_SCRIPTED=1`,
`ANTHROPIC_API_KEY=''`), so they never reach the network and give the same outcome every run.

| Spec | What it covers |
|---|---|
| `access.spec.ts` | Without a session: every page (read from `src/app/**/page.tsx`) redirects to `/login?next=…`, every route handler and method (read from `src/app/**/route.ts`) answers 401, the auth APIs answer as public endpoints; no sign-up page, link or Supabase sign-up; RLS: the anon key reads nothing and cannot insert (42501), update or delete in any public table, view or function. |
| `auth.spec.ts` | Sign-in (one message for every failure), `next`, sign-out, password reset through Mailpit. |
| `quote-tool.spec.ts` | Paste → match → review → price → save, one pricing unit per line (10 bundles of a box sold each = 250 each, its total and the saved unit); PDF upload (`test/fixtures/sample-list.pdf`); an unmatched line's closest item (similarity) → "Use this item" → saved as picked by the rep, its 4 rolls converted to 1 case (rolls are the wrap's own noun); "10 pallets" kept and flagged (counted under Save, still flagged on the saved quote); Swap to an item priced per another unit (converted again, price cleared, unit labels change); a stated pack ("50/bundle, 2 bundles") on an item bundled 25 is flagged, never converted, and shown on the saved quote; Save disabled until priced; the 200-line cap. |
| `quotes.spec.ts` | Edit customer, reference, quantity and price (units shown, total follows, change persists); delete with confirm (gone, 404); the example quote (tagged, creator "Example", no Edit or Delete, API 409). |
| `settings.spec.ts` | Match strictness: change, persists, new runs use it, back to Strict. |

## Run it locally

```bash
npm run db:start        # the local Supabase stack (once)
npm run db:env          # writes .env.local from it (URL, anon key, DATABASE_URL, MAILPIT_URL)
npm run build           # the suite runs the production build
npm run e2e             # = npx playwright test
```

What happens:

1. `playwright.config.ts` finds the stack's URL, anon key, `DATABASE_URL` and Mailpit URL (shell, then
   `.env.local`, then `supabase status`) and picks a free port.
2. `e2e/global-setup.ts` refuses anything but a local stack (127.0.0.1 or localhost) and runs
   `npm run db:reset`: **the local database is wiped and reseeded** (catalog, example quote, dev users).
3. Playwright starts `npm run start` on that port with the stack's env, `QUERENT_SCRIPTED=1` and
   `ANTHROPIC_API_KEY=''` (a key in `.env.local` never reaches it: `next start` does not override a variable
   that is already set).
4. The `setup` project signs in as `rep@boxt.test` once and saves the session to `e2e/.auth/rep.json`;
   specs reuse it, and the ones that need no session start from an empty context.
5. Screenshots for the report land in `e2e/screenshots/` (1440x900); the HTML report in `playwright-report/`.

Both folders and `e2e/.auth/` are git-ignored.

Useful variations:

- One spec: `npx playwright test e2e/quotes.spec.ts` (the setup project runs first by itself).
- Against a server you already run: `QUERENT_BASE_URL=http://127.0.0.1:3000 npx playwright test`. The
  database is still reset first.
- A Chromium build other than the one this Playwright version installs (for example a preinstalled one):
  `QUERENT_E2E_CHROMIUM=/path/to/chrome npx playwright test`. Otherwise run `npx playwright install chromium`.

## Notes

- **The password-reset link's port.** `supabase/templates/recovery.html` builds the link from
  `{{ .SiteURL }}`, which the local stack fixes at `http://127.0.0.1:3000` (`supabase/config.toml`,
  `[auth] site_url`), while the suite's server runs on a free port. `auth.spec.ts` checks the link's origin is
  the site URL and its path is `/auth/confirm`, then opens the same path and query on the test server. The
  token is not tied to an origin, so nothing else changes. (Using `{{ .RedirectTo }}` would not help: GoTrue
  only accepts redirect URLs on its allow list, which names port 3000.)
- **The lines the specs paste** (`LINES` in `support/helpers.ts`) were checked against the real catalog,
  scorer and scripted judge: two clear matches under Strict, and one stretch-wrap line that Strict leaves
  unmatched (Balanced matches it, which `settings.spec.ts` uses to prove new runs read the saved level).
- `REP2` (`rep2@boxt.test`) is the password-reset user; the spec restores its password at the end.
- No spec may be switched off or focused: `src/e2e-suite.test.ts` fails `npm test` on any skip, only,
  fixme or fail.
- CI (`.github/workflows/ci.yml`) runs the same suite after `npm run test:db`, against a stack it starts
  with `npx supabase start`, on a build made with no Supabase env at all.
