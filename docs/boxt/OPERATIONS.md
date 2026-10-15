# Operating the BOXT Quote Creation Tool

Day-to-day running of the live app: logs and activity reports, users, keys, the catalog, match strictness,
backups and the known follow-ups. Setting it up in the first place is [DEPLOY.md](DEPLOY.md).

Placeholders used below: `<app-url>` is the live address (for example `https://<project-name>.vercel.app`),
`<project-ref>` is the Supabase project's reference (the `<ref>` in `https://<ref>.supabase.co`).
SQL runs in the Supabase dashboard's **SQL Editor**, which connects as the `postgres` role and so can read
everything; app users cannot read the activity log at all.

## Contents

- [Where to look](#where-to-look)
- [Logs](#logs)
- [Activity reports (SQL)](#activity-reports-sql)
- [Users](#users)
- [Keys and passwords](#keys-and-passwords)
- [Catalog and the seed](#catalog-and-the-seed)
- [Match strictness](#match-strictness)
- [Backups and pausing](#backups-and-pausing)
- [Follow-ups](#follow-ups)

## Where to look

| Question | Where |
|---|---|
| Is the app up? Did a request fail? | Vercel > project > **Logs** |
| Who signed in, ran matches, created, edited or deleted quotes, changed settings? | `public.activity_log` ([reports below](#activity-reports-sql)) |
| Failed sign-ins, reset requests, password changes | Supabase > **Logs** (Auth), and `auth.audit_log_entries` |
| Who has an account? | Supabase > **Authentication > Users** |
| Is Claude being called? What does it cost? | Claude Console (https://platform.claude.com) usage page |

## Logs

### Vercel runtime logs

Vercel > the project > **Logs** ([runtime logs](https://vercel.com/docs/logs/runtime)). Each request shows
its path, status, duration, region and browser. Filter by **Status Code** (500s for errors), **Request
Path** (for example `/api/quote-tool/match`) or **Level**. Retention: **1 hour** on Hobby, **1 day** on Pro
(30 days with Observability Plus).

What the app itself writes there: **nothing**. It has no logging calls, so customer lists, PDFs, quote
contents and emails never reach the logs. What Vercel records on its own: the request line (method, path,
query string), status and browser, not request or response bodies. One thing to know: the Swap search in
the review dialog sends the typed words in the URL (`/api/catalog/search?q=...`), so those words appear in
the request path.

Status codes you will see and what they mean:

| Status | Where | Meaning |
|---|---|---|
| 307 | any page | Not signed in: sent to `/login` (normal). |
| 401 | `/api/*` | Not signed in, or the session ended (normal after sign-out or a ban). |
| 403 | `/api/*` POST/PUT/PATCH/DELETE | Cross-origin request refused (a request not sent by the app's own pages). |
| 413 | `/api/quote-tool/match` | List over 200 lines or 60,000 characters, or PDF over 4 MB (the rep sees why). |
| 504 | `/api/quote-tool/match` | Should not happen: the app stops at 270 s, inside Vercel's 300 s. If it does, check the function's max duration in Vercel settings. |
| 500 | any | A real error: look at the request in Logs, and at Supabase's logs at the same time. |

### Supabase logs

Supabase dashboard > **Logs** (`https://supabase.com/dashboard/project/<project-ref>/logs`). Pick the
source: **Auth** (sign-ins, resets, admin actions), **PostgREST** / API (the app's database requests) or
**Postgres** (database errors). How far back you can look depends on the plan.

- **Failed sign-ins**: in the **Auth** logs, requests to `/token` with status **400** and
  `error_code: invalid_credentials`. The line does not include the email that was typed, and the address is
  Vercel's (the app signs people in from its server), so you can see when and how often, not who. The app
  does not record failed sign-ins itself, by design: an email typed into a failed sign-in is not ours to
  keep.
- **Successful sign-ins, reset requests, password changes**: also in the Auth logs, and in the table
  `auth.audit_log_entries` when **Authentication > Configuration > Audit Logs > Write audit logs to the
  database** is on ([audit logs](https://supabase.com/docs/guides/auth/audit-logs)):

```sql
-- Auth events, newest first: login, logout, user_recovery_requested (reset email asked for),
-- user_updated_password, user_modified, user_deleted, token_revoked ...
select created_at, payload->>'action' as action, payload->>'actor_username' as email
from auth.audit_log_entries
where payload->>'action' <> 'token_refreshed'
order by created_at desc
limit 50;
```

A password-reset link that is opened also shows as a `login` (it signs the person in to choose a new
password).

## Activity reports (SQL)

`public.activity_log` has one row per action: `login`, `logout`, `match_run`, `quote_create`,
`quote_update`, `quote_delete`, `settings_change`. `metadata` holds counts, scores, thresholds and fixed
words only (a database check constraint enforces it), never customer names, references, line text, file
names or emails. Rows of a deleted user keep their action but lose the user (`user_id` becomes null).

Who signed in, and when last (30 days):

```sql
select u.email, count(*) as sign_ins, max(a.created_at) as last_sign_in
from public.activity_log a
left join auth.users u on u.id = a.user_id
where a.action = 'login' and a.created_at > now() - interval '30 days'
group by u.email
order by last_sign_in desc;
```

Match runs per day: how many, how big, how many lines matched, how long they took, and any that failed:

```sql
select date_trunc('day', created_at)::date as day,
       metadata->>'level' as level,
       count(*) as runs,
       count(*) filter (where metadata->>'input' = 'pdf') as pdf_runs,
       sum((metadata->>'rows')::int) as lines,
       sum((metadata->>'matched')::int) as matched,
       sum((metadata->>'unmatched')::int) as no_match,
       sum((metadata->>'judged')::int) as judge_calls,
       round(avg((metadata->>'durationMs')::numeric) / 1000, 1) as avg_seconds,
       round(max((metadata->>'durationMs')::numeric) / 1000, 1) as max_seconds,
       count(*) filter (where metadata->>'outcome' = 'timeout') as timeouts,
       count(*) filter (where metadata->>'outcome' = 'failure') as failures
from public.activity_log
where action = 'match_run'
group by 1, 2
order by 1 desc, 2;
```

`outcome` is `success`, `failure` (the list could not be read, or no product lines were found) or
`timeout` (reading the list took over 150 s). A run's `matched` share is a fair measure of how much the
tool saves reps; at Strict a low share is expected.

Match runs per person (30 days):

```sql
select u.email, count(*) as runs, sum((a.metadata->>'rows')::int) as lines,
       sum((a.metadata->>'matched')::int) as matched
from public.activity_log a
left join auth.users u on u.id = a.user_id
where a.action = 'match_run' and a.created_at > now() - interval '30 days'
group by u.email
order by runs desc;
```

Quotes created, edited and deleted (newest first). `quote_create` carries line counts (`lines`,
`matched`, `unmatched`, `autoMatched`, `repMatched`) and the `level`; `quote_update` carries `lines` and
`removed`; `quote_delete` carries `lines`. The log does not name the quote (no customer data), so use the
time and person:

```sql
select a.created_at, u.email, a.action, a.metadata
from public.activity_log a
left join auth.users u on u.id = a.user_id
where a.action in ('quote_create', 'quote_update', 'quote_delete')
order by a.created_at desc
limit 100;
```

The quotes themselves (with their creator) are in the `quote_summaries` view:

```sql
select created_at, created_by_email, customer_name, reference, line_count, unmatched_count, total
from public.quote_summaries
order by created_at desc
limit 50;
```

Settings changes (`metadata` is `{"from": ..., "to": ...}`):

```sql
select a.created_at, u.email, a.metadata->>'from' as from_level, a.metadata->>'to' as to_level
from public.activity_log a
left join auth.users u on u.id = a.user_id
where a.action = 'settings_change'
order by a.created_at desc;
```

## Users

All of these are done by you, as the Supabase project owner. There is no admin screen in the app and every
user has the same rights.

### Add a user

**Authentication > Users > Add user > Create new user**: email, password, **Auto Confirm User** ticked.
Then see [DEPLOY.md step 4](DEPLOY.md#4-create-the-first-users) for handing over the password. Do not use
**Send invitation**: the app does not handle invitation links.

### Reset a password

- **The person does it** (needs custom SMTP, [DEPLOY.md 3.5](DEPLOY.md#35-email-delivery-custom-smtp)): on
  the app's sign-in page, **Forgot password?**, then the link in the email. You can do this on their behalf
  by entering their email there. Supabase allows one reset email per user per minute.
- **You set it**: use the Admin API command below (it works without email), then give them the new password
  over the phone or in person. Once signed in, they can choose their own at `<app-url>/update-password`.

### Admin API commands

For actions the dashboard does not offer (or to script them), call Supabase's Auth Admin API from your own
computer with the **secret key** (`sb_secret_...`; Settings > API Keys). Never paste the secret key into
the app, Vercel, a chat or a ticket. With a secret key, send it in the `apikey` header only. If you still use
the legacy `service_role` key, send it in both `apikey` and `Authorization: Bearer` headers.

```sh
export SUPABASE_URL=https://<project-ref>.supabase.co
read -rs SECRET                     # paste the secret key, then Enter
H=(-H "apikey: $SECRET" -H "content-type: application/json")

# Find a user's id
curl -s "${H[@]}" "$SUPABASE_URL/auth/v1/admin/users?per_page=200" | python3 -c \
  "import sys,json; [print(u['id'], u['email'], u.get('banned_until')) for u in json.load(sys.stdin)['users']]"

# Set a new password
curl -s "${H[@]}" -X PUT "$SUPABASE_URL/auth/v1/admin/users/<user-id>" -d '{"password":"<new password, 8+ characters>"}'

# Disable (ban) a user: they cannot sign in, and their open sessions stop working in the app at once
curl -s "${H[@]}" -X PUT "$SUPABASE_URL/auth/v1/admin/users/<user-id>" -d '{"ban_duration":"876000h"}'

# Re-enable (unban)
curl -s "${H[@]}" -X PUT "$SUPABASE_URL/auth/v1/admin/users/<user-id>" -d '{"ban_duration":"none"}'

# Delete a user
curl -s "${H[@]}" -X DELETE "$SUPABASE_URL/auth/v1/admin/users/<user-id>"

unset SECRET
```

### Disable or delete someone who leaves

- **Disable (ban)** is the usual choice: the account stays, so the activity log keeps their name. Because
  the app checks every request with Supabase, a banned person is signed out of the app at their next click
  (Supabase notes that a ban alone does not revoke sessions, but this app asks the Auth server each time).
  Unbanning restores the account, and any session it still had.
- **Delete** (**Authentication > Users**, the user's menu, or the Admin API command above) removes the
  account. Their quotes stay, still showing their email as the creator (`created_by_email`); their activity
  rows stay but no longer say who.

Both were checked on the local stack: after a ban or a delete, the person's next API request answers 401
and pages send them to the sign-in page.

## Keys and passwords

Rotate a key when someone who knew it leaves, when it may have been exposed, or on a schedule.

| What | Who uses it | How to rotate |
|---|---|---|
| Anthropic API key | The app (Vercel `ANTHROPIC_API_KEY`) | Claude Console > API keys: create a new key. Vercel > **Settings > Environment Variables**: replace `ANTHROPIC_API_KEY` (Production). **Redeploy** (Deployments > the latest production deployment > Redeploy). Check that matching still calls Claude ([DEPLOY.md go-live check 7](DEPLOY.md#8-go-live-checklist)). Then delete the old key in the Claude Console. |
| Supabase publishable key | The app (Vercel `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | **Settings > API Keys**: create a new publishable key, put it in Vercel, redeploy (the value is built into the app), check sign-in, then delete the old one. Signed-in users stay signed in. |
| Supabase secret key | You (Admin API commands) | **Settings > API Keys**: create a new secret key, update your password manager, delete the old one (cannot be undone). Nothing in Vercel changes. ([API keys](https://supabase.com/docs/guides/api/api-keys)) |
| Legacy `anon` / `service_role` keys | Nothing, once the app uses the publishable key | **Settings > API Keys**: disable the legacy keys (reversible). Do this only after the app runs on the publishable key, or sign-in stops working. Supabase is deprecating them by the end of 2026. |
| JWT signing key | Supabase Auth (signs session tokens) | **Settings > JWT Keys** ([signing keys](https://supabase.com/docs/guides/auth/signing-keys)): migrate to the new signing keys, then **Rotate keys**. Rotating does not sign anyone out. Revoke the old legacy secret only after disabling the legacy API keys and waiting at least the token lifetime plus 15 minutes (1 hour 15 minutes by default). The app does not verify tokens itself (it asks the Auth server), so it needs no change. |
| Database password | `npm run db:seed:boxt`, the Supabase CLI, SQL tools. Not the app. | **Settings > Database**: reset the database password. Update your password manager, and run `npx supabase link --project-ref <project-ref>` again before the next `db push`. The live app is not affected. |

Vercel environment variables apply only to deployments made after the change: always redeploy after
changing one ([environment variables](https://vercel.com/docs/environment-variables)).

## Catalog and the seed

The catalog comes from BOXT's public website (boxtpackaging.com) and is stored in the repository as
`data/boxt-catalog.json` (1,555 rows). Prices in it are the website's list prices: the app shows them only as
a reference label ("Web list: ...") and never fills a quote price from them.

To refresh it:

1. Optional, fetch the current website catalog into the file: `npx tsx scripts/fetch-boxt-catalog.ts`. It
   prints how many items it wrote. Review the change (`git diff --stat data/boxt-catalog.json`).
2. Run the tests (`npm test`): the evaluation suite runs every test line against the catalog, so a removed
   or renamed item shows up there. If an item the example quote uses disappears, the seed stops with "The
   example quote needs SKUs the catalog does not have" and changes nothing.
3. Commit the file, then load it into the live database exactly as in
   [DEPLOY.md 2.2](DEPLOY.md#22-load-the-catalog-and-the-example-quote): `npm run db:seed:boxt` with
   `DATABASE_URL` set. It is idempotent: it updates existing items by SKU, adds new ones, refreshes the
   example quote, and never deletes an item (items that left the website stay in the database).
4. The running app caches the catalog for up to 10 minutes, so new items appear in matching within 10
   minutes (or at once after a redeploy).

Saved quotes are not affected: each saved line keeps its own copy of the item's description, pack and list
price from when it was saved.

## Match strictness

Any signed-in user can change it in the app: **Settings > Match strictness** (Strict, Balanced, Lenient).
It applies to everyone, for new match runs only; saved quotes do not change. Each change is logged as
`settings_change` ([report above](#activity-reports-sql)). To check the current level:
`select match_strictness, updated_at from public.org_settings;`

**Strict** is the default and the recommended setting. The product rule is to prefer "No match" over a
wrong item: in the evaluation suite Strict matched no wrong item at all, even with a judge that agrees with
everything, while Balanced and Lenient match more lines but let some wrong items through when the judge
does not catch them. The numbers behind each level and the latest evaluation results are in
`src/eval/README.md`; the levels themselves are defined in `src/features/settings/strictness.ts`.

## Backups and pausing

([Backups](https://supabase.com/docs/guides/platform/backups),
[project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).)

- **Pro** projects get daily backups (7 days kept on Pro, 14 on Team), restored from **Database >
  Backups**. The project is unavailable during a restore. Point-in-time recovery is a paid add-on.
- **Free** projects have no backups listed by Supabase; Supabase recommends regular exports. Take one
  yourself (the CLI asks for the database password; store the file somewhere safe, it contains customer
  data):

```sh
npx supabase link --project-ref <project-ref>      # once
npx supabase db dump --linked --data-only -f boxt-data-$(date +%F).sql
npx supabase db dump --linked -f boxt-schema-$(date +%F).sql
```

- **Free** projects are **paused after 7 days** without enough database activity. Resume from the
  dashboard (**Resume project**), within a year. Pro projects are not paused.
- The catalog and the example quote can always be rebuilt from the repository with the seed; saved quotes
  and users cannot, so back up once real quotes exist.

## Follow-ups

Known gaps, decided and documented rather than built.

- **F3: magic links.** Supabase cannot turn off magic links while keeping password sign-in. With sign-ups
  off, anyone who knows a user's email can make Supabase's Auth API email that user a sign-in link. The
  link cannot create an account and the app cannot complete it (it accepts only passwords and reset links),
  so the effect is an unexpected email. Mitigation: replace the **Magic link** email template's body with a
  notice and no link ([DEPLOY.md 3.3](DEPLOY.md#33-magic-links-and-email-codes-follow-up-f3)).
- **F4: password change without the old password, and MFA.** A signed-in user can set a new password at
  `/update-password` without typing the current one (Supabase's **Secure password change** is off), so
  anyone with a person's unlocked, signed-in browser could change their password. Possible next steps:
  ask for the current password in the app, turn on Secure password change (asks for recent sign-in), and
  add multi-factor authentication (Supabase supports TOTP apps). None is built yet.
- **Reset links opened by mail scanners.** Some corporate mail filters open links before the person does,
  which uses up the one-time reset token. If reps hit "link expired" every time, the fix is a confirm button
  on the page before the token is used (or a 6-digit code instead of a link).
- **Error reporting (optional).** There is none, on purpose. If you add a service such as Sentry, configure
  it so it never sends request bodies, form fields, cookies or headers (customer lists, PDFs and quote
  contents are in them): turn off default PII and body capture, and scrub events before sending. Add its
  host to the go-live check that the app talks to no other hosts, and update
  [DEPLOY.md 10](DEPLOY.md#10-data-flow-and-confidentiality).
- **Secrets manager (R-2).** Keys live in Vercel's environment variables (marked Secret) and in local
  `.env.local` files. Moving them to a dedicated secrets manager is a later option.
