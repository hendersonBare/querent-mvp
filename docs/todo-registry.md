# TODO registry

Deferred work from the v3 decision log (decision 40). Each item is marked in code as `TODO(R-n)` where the work will go; `src/todo-registry.test.ts` fails when a marker in `src/` names an ID missing here, when an ID placed in code has no marker, or when this table drifts from the decision log's wording. Do not build any of it without a new decision.

| ID | TODO | Where |
|---|---|---|
| R-1 | Quote-to-order: create real orders from accepted quotes, then redefine the metric (today accepted ÷ created) | `src/server/team/metrics.ts` |
| R-2 | Move API keys from `.env.local` to user secrets or a secrets manager | `.env.example`; every module that reads `ANTHROPIC_API_KEY` or `OILPRICEAPI_KEY` (`src/server/chat/mode.ts`, `src/server/chat/live.ts`, `src/server/customer/suggestion-picker.ts`, `src/server/upsells-writer/claude.ts`, `src/server/freight/fuel-price.ts`) |
| R-3 | Outreach: add idempotency and scheduling (when demo outreach is built, send once at quote creation) | `src/server/quotes/aging.ts` |
| R-4 | Replace the demo cookie auth with a third-party auth service | `src/server/session.ts` |
| R-5 | PII removal layer for chat transcripts and `query_logs` | `src/server/repository/chat.ts` (message and query log writers) |
| R-6 | Stricter guards on `/api/test/*` routes before deployment | `src/app/api/test/reset/route.ts`, `src/app/api/test/rep-quotes/route.ts`, `src/app/test/ui/page.tsx` |
| R-7 | Deferred reminders: email and SMS, scheduler, Apollo and Twilio integrations (item I) | `src/server/quotes/aging.ts` |
| R-8 | Deferred lifecycle ideas: reminder ladders, digests, auto-reassignment, snooze, auto-drafted follow-ups | `src/server/quotes/aging.ts` |
| R-9 | Diesel price endpoint if OilPriceAPI has none (diesel is $0 until then) | `src/server/freight/fuel-price.ts` |
| R-10 | Routing API for real road miles and drive time | `src/server/freight/cost-model.ts` |
| R-11 | Fleet onboarding to prefill MPG and vehicle inputs | `src/server/freight/cost-model.ts` |
| R-12 | Hierarchical visibility (manager subtree), named groups, with real auth | `src/server/rep/http.ts`, `src/server/rep/access.ts` |
| R-13 | Tooling mismatches deliberately ignored for now (Supabase and Railway tooling in the dev environment) | Registry only: tooling, nothing in `src/` |
| R-14 | Real anonymous query route: public tool allow-list, rate limit, CORS, then Supabase auth and embed | `src/app/api/query/visitor/chat/route.ts` (the visitor box's stub, decision 49) |
