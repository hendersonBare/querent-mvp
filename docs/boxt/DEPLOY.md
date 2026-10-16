# Deploying the BOXT Quote Creation Tool

This is the owner's runbook for putting the BOXT quote tool (branch `boxt/quote-tool`) on the internet: a
Supabase project for the database and sign-in, and a Vercel project for the app, on Vercel's default
`*.vercel.app` address. You create both accounts and projects yourself, and you hold every key. Nothing in
this repository creates a project or contains a production key.

Day-to-day running (logs, users, key rotation, backups) is in [OPERATIONS.md](OPERATIONS.md). The product
rules and architecture are in [plan.md](plan.md).

Dashboard menus change from time to time. Each section links the official page it was checked against
(October 2026); if a label differs, the linked page has the current one.

## Contents

0. [Before you start](#0-before-you-start)
1. [Create the Supabase project](#1-create-the-supabase-project)
2. [Create the database tables and load the catalog](#2-create-the-database-tables-and-load-the-catalog)
3. [Configure Supabase Auth](#3-configure-supabase-auth)
4. [Create the first users](#4-create-the-first-users)
5. [Deploy to Vercel](#5-deploy-to-vercel)
6. [Point Supabase Auth at the app's address](#6-point-supabase-auth-at-the-apps-address)
7. [Environment variables](#7-environment-variables)
8. [Go-live checklist](#8-go-live-checklist)
9. [Adding a custom domain later](#9-adding-a-custom-domain-later)
10. [Data flow and confidentiality](#10-data-flow-and-confidentiality)
11. [Verified locally](#11-verified-locally)

## 0. Before you start

You need:

- A computer with Node.js 22 or newer and Git, and a clone of the repository with the branch checked out:
  `git clone <repo-url> && cd <repo> && git checkout boxt/quote-tool && npm ci`.
- A Supabase account (https://supabase.com), a Vercel account (https://vercel.com) connected to the GitHub
  account that can see the repository, and a Claude Console account (https://platform.claude.com) for an
  Anthropic API key ([how to get one](https://platform.claude.com/docs/en/get-api-key)).
- An email sender for password-reset emails (see [3.5](#35-email-delivery-custom-smtp)). Without one, you
  set and reset passwords yourself.

Choose the plans before you start:

| Service | Free tier | What it means for this app |
|---|---|---|
| Vercel Hobby | Free | Hobby is for **non-commercial, personal use only** ([Hobby plan](https://vercel.com/docs/plans/hobby)). A business tool for BOXT belongs on **Pro**. Function time is the same on both for this app (300 s, see [5.4](#54-function-time-and-upload-limits)); Pro also keeps runtime logs for a day instead of an hour. |
| Supabase Free | Free | Paused after 7 days without enough database activity ([project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)); no daily backups (Pro keeps 7 days: [backups](https://supabase.com/docs/guides/platform/backups)); leaked-password protection needs Pro. **Pro** is recommended once real quotes are stored. |
| Anthropic API | Pay per use | Set a spend limit in the Claude Console if you want a cap. |

## 1. Create the Supabase project

1. In the Supabase dashboard, **New project**. Pick the organization, a name (for example
   `boxt-quote-tool`), and a **database password**: use a long random one and store it in your password
   manager. You need it for step 2 and for [`DATABASE_URL`](#7-environment-variables).
2. **Region**: put the database next to where the app runs. Vercel runs functions in Washington, D.C.
   (`iad1`) unless you change it ([Vercel limits](https://vercel.com/docs/functions/limitations)), so
   **East US (North Virginia)** is the natural pair. If you pick another region, set Vercel's function
   region to match in [5.3](#53-project-settings).
3. If the form offers security options for the Data API, keep the **Data API on** with the `public` schema
   exposed (the default). The app talks to the database through it.
4. Wait for the project to finish provisioning, then copy these four things into your password manager:

| What | Where in the dashboard | Used for |
|---|---|---|
| Project URL, `https://<project-ref>.supabase.co` | **Connect** (top of the project page) | `NEXT_PUBLIC_SUPABASE_URL` (Vercel) |
| **Publishable key**, `sb_publishable_...` | **Settings > API Keys** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Vercel). Public by design: safe in a browser, everything behind it is protected by row-level security. |
| **Secret key**, `sb_secret_...` | **Settings > API Keys** | Admin commands from your own machine only ([OPERATIONS.md](OPERATIONS.md#users)). **Never put it in Vercel.** It bypasses row-level security. |
| Database connection string (Session pooler) | **Connect > Session pooler** | `DATABASE_URL` for the seed in step 2. **Never put it in Vercel.** |

About the key names ([API keys](https://supabase.com/docs/guides/api/api-keys)): Supabase now issues
**publishable** (`sb_publishable_...`) and **secret** (`sb_secret_...`) keys. They replace the legacy
**anon** and **service_role** keys (long JWTs starting `eyJ`), which Supabase is deprecating by the end of
2026. Our variable is still called `NEXT_PUBLIC_SUPABASE_ANON_KEY`, but it takes either kind: put the
**publishable key** in it (verified against the local stack, see [11](#11-verified-locally)). Wherever this
guide says "secret key", the legacy `service_role` key also works until you disable legacy keys.

About the connection string ([connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)):
the **direct** connection (`db.<ref>.supabase.co:5432`) needs IPv6 unless you buy the IPv4 add-on, so use
the **Session pooler** string, which works everywhere:
`postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres`. Copy the pooler host from the
Connect dialog rather than typing it. If the password has characters such as `@ # ? & /` or spaces,
percent-encode them in the URL.

## 2. Create the database tables and load the catalog

The schema is four SQL files in `supabase/migrations/`, applied in order:

1. `20261015170000_boxt_schema.sql`: tables, the `quote_summaries` view, constraints and triggers.
2. `20261015170100_boxt_security.sql`: grants, row-level security, the example-quote guard.
3. `20261015170200_boxt_quote_rpcs.sql`: `create_quote` and `update_quote` (a quote and its lines save atomically).
4. `20261016090000_boxt_customer_quantity.sql`: adds `quote_lines.customer_quantity`, the customer's
   quantity as they wrote it ("10 bundles", "10 pallets", at most 100 characters), kept when the review
   dialog converted it into the item's pricing unit or flagged it, so the saved quote can still show it.
   It also replaces the line writer that `create_quote` and `update_quote` use, so they accept that
   field. Additive: existing quotes keep their lines, with no customer quantity.

### 2.1 Apply the migrations (choose one way)

**A. Supabase CLI (recommended).** From the repository root (the CLI is a dev dependency, so `npx` uses the
pinned version; [`db push` reference](https://supabase.com/docs/reference/cli/supabase-db-push)):

```sh
npx supabase login                             # opens the browser once
npx supabase link --project-ref <project-ref>  # asks for the database password
npx supabase db push --dry-run                 # lists the 4 migrations it would apply
npx supabase db push                           # applies them
```

`db push` records each file in `supabase_migrations.schema_migrations`, so running it again later only
applies new files. A project set up before the fourth file existed gets just that one: run the same two
`db push` commands (the dry run lists only `20261016090000_boxt_customer_quantity.sql`), then redeploy
the app.

Do **not** run `npx supabase config push`: it would copy the local `supabase/config.toml` (which points at
`http://127.0.0.1:3000`) over the hosted project's Auth settings.

**B. SQL editor.** In the dashboard, **SQL Editor > New query**, paste the whole of the first file, **Run**,
then the second, the third and the fourth, in that order. This does not fill the migration history, so if
you later switch to the CLI, first mark the files you ran as applied:
`npx supabase migration repair --status applied 20261015170000 20261015170100 20261015170200 20261016090000`.

Check the result in the SQL editor:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'quote_lines' and column_name = 'customer_quantity';
```

Expected: `activity_log`, `catalog_items`, `org_settings`, `quote_lines`, `quotes`, each with
`rowsecurity = true`; and one row, `customer_quantity` (the fourth file is applied).

### 2.2 Load the catalog and the example quote

`npm run db:seed:boxt` upserts the 1,555 BOXT catalog rows from `data/boxt-catalog.json` and creates the one
**Example quote** (customer "Example customer", reference "Example quote": 3 matched, priced lines and 1
unmatched line with its closest items, prices illustrative), in a single transaction. The example quote is
read-only and cannot be deleted, by anyone, in the app or through the database's API; only the seed may
rewrite it. The seed is idempotent: run it again whenever you like.
It needs `DATABASE_URL` (the Session pooler string from step 1). A value in the shell wins over
`.env.local`, so a local `.env.local` does not get in the way.

Type the password without it landing in your shell history:

```sh
read -rs DB_PASSWORD            # type the database password, then Enter
export DATABASE_URL="postgresql://postgres.<project-ref>:${DB_PASSWORD}@<pooler-host>:5432/postgres?sslmode=no-verify"
npm run db:seed:boxt
unset DATABASE_URL DB_PASSWORD
```

Expected output, first run:

```
Seeded the remote database: catalog 1555 rows (1555 new, 0 updated); example quote 4 lines.
```

On later runs the counts read `(0 new, 1555 updated)`. Any failure prints `db:seed:boxt failed: <reason>`
and changes nothing.

About `?sslmode=no-verify`: the seed uses node-postgres, which treats `sslmode=require` as "verify the
certificate against the public certificate authorities", and Supabase's database certificate is signed by
Supabase's own authority. `no-verify` encrypts the connection without checking that chain (the same as
`sslmode=require` in other Postgres tools, which is what Supabase recommends as the minimum). For full
verification, download the CA certificate from **Database Settings > SSL Configuration** and use
`?sslmode=verify-full&sslrootcert=/path/to/the-downloaded.crt` instead.

To refresh the catalog from boxtpackaging.com first, see [OPERATIONS.md](OPERATIONS.md#catalog-and-the-seed).

## 3. Configure Supabase Auth

The app signs people in with email and password only. There is no sign-up page, link or call in the app;
these settings make sure the Supabase project refuses sign-ups too.

### 3.1 Turn off sign-ups

**Authentication > Sign In / Providers**, section **User Signups**: turn **Allow new users to sign up**
**off**, and leave **Allow anonymous sign-ins** and **Allow manual linking** off. Save.
([General configuration](https://supabase.com/docs/guides/auth/general-configuration).)

With sign-ups off, only users you create in [step 4](#4-create-the-first-users) exist.

### 3.2 Providers and passwords

On the same page, under **Auth Providers**:

- **Email**: keep it **enabled** (it is the email and password sign-in). Inside it:
  - **Minimum password length**: **8**. The app's "Choose a new password" form already requires 8; this
    makes passwords you set in the dashboard follow the same rule. Supabase recommends at least 8
    ([password security](https://supabase.com/docs/guides/auth/password-security)). Add character
    requirements if you like.
  - **Leaked password protection** (Pro plan, in the Auth settings): turn it on if available.
  - **Secure password change**: leave it as it is for now (off). See follow-up F4 in
    [OPERATIONS.md](OPERATIONS.md#follow-ups).
  - **Confirm email** does not matter here (it applies to sign-ups, which are off).
- **Phone** and every social provider: **off**.

### 3.3 Magic links and email codes (follow-up F3)

Supabase has no switch that turns off magic links or email codes while keeping email and password
([passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless): "Email
authentication methods, including Magic Links, are enabled by default"). So even with sign-ups off,
anyone who knows a user's email can ask Supabase's Auth API (not the app) to email that user a sign-in link.

What that link can and cannot do:

- It cannot create an account (sign-ups are off) and cannot sign anyone into the app: the app accepts only
  password sign-in and password-reset links, and has nowhere to complete a magic link.
- The user receives an unexpected email, and it counts toward the email rate limit.

Recommended: in **Authentication > Email Templates > Magic link**, replace the body with a short notice
and no link, for example `<p>Sign-in links are not used for the BOXT quote tool. Sign in with your
email and password. If you did not expect this email, you can ignore it.</p>`. Do the same for **Invite
user** and **Confirm sign up**, which this app never uses.

### 3.4 Reset Password email template

**Authentication > Email Templates > Reset password**
([email templates](https://supabase.com/docs/guides/auth/auth-email-templates)):

- **Subject**: `Reset your BOXT quote tool password`
- **Body**: paste the contents of `supabase/templates/recovery.html` (the same template the local stack
  uses):

```html
<h2>Reset your password</h2>
<p>Someone asked to reset the password for your BOXT quote tool account. If it was you, follow this link to choose a new password:</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/update-password">Choose a new password</a></p>
<p>If you did not ask for this, you can ignore this email; your password stays the same.</p>
```

The link is built from `{{ .SiteURL }}`, so the **Site URL** must be the app's address (step 6). It opens
the app's `/auth/confirm`, which checks the one-time token on the server and sends the user to
`/update-password`. A used or expired link shows "link expired" with a way to ask for a new one.

Some corporate mail filters (for example Microsoft Defender Safe Links) open links before the person does,
which uses up the one-time token, and the person then sees "link expired". If that happens to a BOXT
mailbox, ask IT to exclude the app's address from link scanning, or set the password yourself
([step 4](#4-create-the-first-users)).

### 3.5 Email delivery (custom SMTP)

Supabase's built-in email service **only delivers to members of your Supabase organization's team**, at
**2 emails an hour**, with no delivery guarantee: it is for trying things out, not production
([custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)). So password-reset emails to BOXT reps
will not arrive until you set up custom SMTP.

1. Pick a sender. You need a "from" address on an email domain whose DNS you (or BOXT's IT) control, for
   example `no-reply@<boxt-email-domain>`. The app itself does not need a custom domain for this. Options:
   BOXT's existing mail system's SMTP relay (Google Workspace, Microsoft 365), or a transactional email
   service such as Resend, Postmark, Amazon SES, Twilio SendGrid, ZeptoMail or Brevo. Each walks you through
   the DNS records (SPF, DKIM) that let it send for that domain.
2. **Authentication > Emails > SMTP Settings** (dashboard URL `.../project/<ref>/auth/smtp`): enable custom
   SMTP and enter the host, port, user, password, sender email and sender name (for example "BOXT quote
   tool").
3. Send yourself a reset (go-live check 6) and confirm it arrives and is not marked as spam.

Until custom SMTP works, set and change passwords yourself as in [step 4](#4-create-the-first-users).

### 3.6 Rate limits

Defaults that matter here ([rate limits](https://supabase.com/docs/guides/auth/rate-limits); change them in
**Authentication > Rate Limits**):

| What | Default |
|---|---|
| Emails sent by Auth (all kinds) | 2 an hour with the built-in sender; 30 an hour once custom SMTP is on (adjustable) |
| Password-reset request | 1 per user per 60 seconds |
| Requests that send email or check a code (`recover`, `otp`, `magiclink`, `signup`, `verify`) | 30 per 5 minutes per IP address |
| Token requests (password sign-in, session refresh) | 150 per 5 minutes per IP address |

Note: the app signs users in from its server, so Supabase sees Vercel's addresses rather than each rep's.
At BOXT's size the per-IP limits are far away; raise the token limit if many reps ever sign in at once.

## 4. Create the first users

**Authentication > Users > Add user > Create new user**: enter the person's work email and a password,
and tick **Auto Confirm User** so they can sign in straight away. Repeat for each person.

- Do **not** use **Add user > Send invitation**: the app does not handle invitation links.
- Every signed-in user can do everything (create, edit and delete any quote, change the match strictness).
  There are no roles.
- To check that a user is confirmed (SQL editor):
  `select email, email_confirmed_at, last_sign_in_at from auth.users order by email;`

Giving people their password:

- **With custom SMTP working (recommended):** set a long random password nobody needs to know, then tell the
  person to open the app, choose **Forgot password?**, and set their own from the email.
- **Without custom SMTP:** tell them the password over a different channel than their email (phone or in
  person). Once signed in, they can choose their own at `<app-url>/update-password`.

Resetting, disabling and deleting users later: [OPERATIONS.md](OPERATIONS.md#users).

## 5. Deploy to Vercel

### 5.1 Which branch goes live

Vercel builds the repository's **production branch** for the live address. By default that is the
repository's default branch (`main`), which still holds the earlier Querent demo until the BOXT pull
request is merged. Either:

- merge the `boxt/quote-tool` pull request into `main` first (recommended), or
- after importing, set the production branch to `boxt/quote-tool` in **Settings > Environments >
  Production** (branch tracking).

### 5.2 Import the project

1. https://vercel.com/new > **Import Git Repository** > choose the repository.
2. **Framework Preset**: Next.js (detected). **Root Directory**: the repository root. Leave the **Build
   Command** (`next build`, which is `npm run build`), **Install Command** (npm, from `package-lock.json`)
   and **Output Directory** at their defaults.
3. **Environment Variables**: add the four production variables now. The build itself does not need
   them (it succeeds without any Supabase setting), but `NEXT_PUBLIC_*` values present at build time are
   built into the app, and without them the deployed app cannot sign anyone in:

| Name | Value | Type |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Config |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable key, `sb_publishable_...` | Config |
| `ANTHROPIC_API_KEY` | your Anthropic API key | **Secret** |
| `ANTHROPIC_MODEL` | leave unset to use the default (see [7](#7-environment-variables)) | Config |

   Apply them to **Production**. Do not add `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
   `QUERENT_SCRIPTED` or `PORT` (see [7](#7-environment-variables)).
4. **Deploy**. When it finishes, the project's production address is `https://<project-name>.vercel.app`
   (shown under **Domains** on the project page). Use that address, not the long per-deployment URL.

Vercel only applies changed environment variables to **new** deployments
([environment variables](https://vercel.com/docs/environment-variables)): after changing one, redeploy
(**Deployments > ... > Redeploy**).

### 5.3 Project settings

- **Node.js version** (**Settings > Build and Deployment > Node.js Version**): choose **22.x**, the version
  the project is developed and tested on (24.x, Vercel's current default, should also work)
  ([Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)).
- **Function region** (**Settings > Functions**): same area as the Supabase region. The default
  Washington, D.C. (`iad1`) suits a Supabase project in East US (North Virginia).
- **Preview deployments**: other branches and pull requests get preview builds. Give them no environment
  variables (production only, as above): without Supabase settings a preview cannot reach your data. The
  preview still builds; it fails closed when used (every page sends you to the sign-in page, every API
  answers 401, and signing in fails with an error).

### 5.4 Function time and upload limits

([Max duration](https://vercel.com/docs/functions/configuring-functions/duration),
[limits](https://vercel.com/docs/functions/limitations).)

- The matching route (`POST /api/quote-tool/match`) declares `maxDuration = 300` seconds. Vercel allows
  300 s on Hobby (default and maximum) and on Pro (default 300 s, maximum 800 s), so it fits either plan
  with no setting to change. Inside that, the app gives up reading a list after **150 s** (the Claude call
  is aborted and the rep sees "Reading the list took too long. Try again, or split it into smaller
  lists.") and stops judging **270 s** after the run started (lines not judged by then are "No match"), so a
  run always ends with a clear message rather than a platform timeout. The judge is asked only about lines
  the scorer already clears; each judge call has a **30 s** limit, with at most **4** calls at a time, and
  a call that fails or runs late makes that line "No match".
- Vercel refuses request bodies over **4.5 MB** (`413 FUNCTION_PAYLOAD_TOO_LARGE`). The app caps PDFs at
  **4 MB** (checked in the browser before upload and again on the server, which allows the upload's form
  framing on top), so every PDF the app accepts fits under Vercel's limit. Pasted lists are capped at
  **200 lines** and **60,000 characters**. These three limits are checked on the page first, and the
  server answers `413` with a message saying what to do. A PDF that reads as more than 200 lines ends the
  run with "This list has more than 200 lines. Split it into smaller lists ...".

### 5.5 Deployment Protection

([Deployment Protection](https://vercel.com/docs/deployment-protection),
[Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication).)

Vercel can put its own login in front of a deployment. The app's own sign-in is the gate either way: every
page and API needs a signed-in BOXT user. Recommended setting: **Settings > Deployment Protection >
Vercel Authentication on, scope Standard Protection** (available on all plans).

| Scope | What it protects | Effect on BOXT users |
|---|---|---|
| **Standard Protection** (recommended) | Preview URLs and per-deployment URLs. Not the production address. | None. Reps use `https://<project-name>.vercel.app` and see the app's login. Previews need a Vercel login with access to the project. |
| **All Deployments** | Everything, including the production address. | Every rep would need a Vercel account with access to the project (Hobby allows one outside user per account; Pro needs Viewer seats), and would meet Vercel's login before the app's. The password-reset link opens the production address, so it would also stop at Vercel's login. Not recommended. |
| Password Protection | A shared password in front of the chosen scope. | Pro add-on ($20 a month per project). Adds a second, shared password before the app's login and before reset links. Not needed. |

With Standard Protection, the Supabase **Site URL** must be the production address
(`https://<project-name>.vercel.app`), not a per-deployment URL, or reset links would land on a protected URL.

## 6. Point Supabase Auth at the app's address

**Authentication > URL Configuration**
([redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)):

- **Site URL**: `https://<project-name>.vercel.app` (no trailing slash). Reset emails build their link from it.
- **Redirect URLs**: add `https://<project-name>.vercel.app/auth/confirm`. (Supabase also accepts any
  address on the Site URL's own host; the explicit entry documents the one path the app uses.) Remove the
  `localhost` entries if the dashboard added any.

## 7. Environment variables

Every variable the app or its scripts read. `.env.example` has the same list with placeholders.

| Variable | What it is, where to get it | Vercel (Production) | Local `.env.local` | CI | Secret? |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL, `https://<ref>.supabase.co` (the **Connect** dialog). Local: `http://127.0.0.1:54321`. | **Yes** | Written by `npm run db:env` | Local stack (not set for the build) | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key `sb_publishable_...` (or the legacy anon key; `db:env` writes the local stack's legacy anon key). Public: row-level security protects the data. | **Yes** | Written by `npm run db:env` | Local stack (not set for the build) | No (public by design) |
| `ANTHROPIC_API_KEY` | Claude Console > API keys. Also needed on your own machine for `npm run eval:record` ([OPERATIONS.md](OPERATIONS.md#match-strictness)). | **Yes**, type Secret | Optional (empty = fixture parser and judge) | Empty (fixtures) | **Yes** |
| `ANTHROPIC_MODEL` | The Claude model for parsing and judging. Unset = the default in `src/server/llm/client.ts`, currently `claude-sonnet-5-5`. | Optional | Optional | Not set | No |
| `QUERENT_SCRIPTED` | `1` = fixture parser and judge, never the network. | **Must not be set** (or empty) | `1` (written by `db:env`) | `1` | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key `sb_secret_...` (or legacy service_role). Bypasses row-level security. Only for admin commands you run yourself ([OPERATIONS.md](OPERATIONS.md#users)); the app never reads it, and nothing in the deploy needs it. | **No** | Local stack's key (written by `db:env`) | Local stack | **Yes** |
| `DATABASE_URL` | Postgres connection string (Session pooler) with the database password. Only for `npm run db:seed:boxt` and SQL tools. | **No** | Local stack's (written by `db:env`) | Local stack | **Yes** |
| `PORT` | Port for `npm start`. Vercel ignores it. | No | Optional (default 3000) | Set by the test setup | No |
| `QUERENT_DEV_PASSWORD` | Password for the local dev users that `npm run db:reset` creates. Local stack only. | No | Optional | Optional | No (local only) |
| `MAILPIT_URL` | The local stack's mail catcher, where password-reset emails land. Read by the database and browser tests only; the app never reads it. | No | Written by `db:env` | Local stack | No |
| `QUERENT_BASE_URL`, `QUERENT_WEBSERVER`, `QUERENT_E2E_CHROMIUM` | Options for the browser tests only (a server you started yourself, another Chromium build): see `e2e/README.md`. | No | Optional | Not set | No |

Important:

- **If `ANTHROPIC_API_KEY` is missing or `QUERENT_SCRIPTED=1` is set, the app does not fail: it silently
  uses the fixture parser and judge**, which are for tests and give poor results on real lists. Check
  go-live item 7 after every change to these variables.
- `NEXT_PUBLIC_*` values are built into the app: change them, then redeploy.
- Never commit a real value. `.env.local` is git-ignored; `.env.example` holds placeholders only.

## 8. Go-live checklist

Run these against the live address once steps 1 to 6 are done. Set three shell variables first (the
publishable key is public, so it is fine in a terminal):

```sh
export APP=https://<project-name>.vercel.app
export SUPABASE_URL=https://<project-ref>.supabase.co
export ANON=<publishable key>
```

| # | Check | How | Expected |
|---|---|---|---|
| 1 | Sign-up is impossible | `curl -s -X POST "$SUPABASE_URL/auth/v1/signup" -H "apikey: $ANON" -H "content-type: application/json" -d '{"email":"nobody@example.com","password":"a-long-password-1"}'` | `{"code":422,"error_code":"signup_disabled","msg":"Signups not allowed for this instance"}` |
| 2 | `/signup` is not a page | `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$APP/signup"` | `307 .../login?next=%2Fsignup` (signed out). Signed in, the browser shows 404. |
| 3 | Pages need a session | `for p in / /quote-tool /quotes /settings; do curl -s -o /dev/null -w "$p %{http_code} %{redirect_url}\n" "$APP$p"; done` | Each `307` to `/login?next=...` |
| 4 | APIs need a session | `for p in /api/quotes /api/settings "/api/catalog/search?q=box"; do curl -s -w " $p\n" "$APP$p"; done; curl -s -X POST -w " match\n" "$APP/api/quote-tool/match"` | Each `{"error":"Sign in to continue."}` (HTTP 401) |
| 5 | Row-level security: the public key alone reads nothing | `for t in catalog_items quotes quote_lines quote_summaries org_settings activity_log; do curl -s "$SUPABASE_URL/rest/v1/$t?select=*&limit=1" -H "apikey: $ANON" -w " $t\n"; done` | Each `{"code":"42501",...,"message":"permission denied for table <name>"}` (HTTP 401; the view says "for view") |
| 6 | Sign-in and password reset | In a private browser window: open `$APP`, sign in as a user from step 4. Sign out, choose **Forgot password?**, enter the email, open the email, choose a new password. | You land on **Quote creation tool** after each. The email arrives from your SMTP sender within a minute. A wrong password says "Email or password is incorrect." |
| 7 | Matching uses Claude (live mode) | Paste a short list (for example `500 - 12 x 10 x 8 single wall boxes, 32 ECT` and `250 boxes 12 x 10 x 8 double wall, 48 ECT`) and run it. Then look at the Claude Console usage page. | The review dialog opens with one outcome per line, and the Claude Console shows new requests for your key at that time. No new requests means the app is in fixture mode: see [7](#7-environment-variables). A matched line shows its quantity and price in the item's pricing unit ("each", "per each", "Web list: $.../each"). |
| 8 | The example quote is there | Open **Quotes**, then the example. | "Example quote" for "Example customer" is listed with the **Example** tag and creator "Example", 4 lines (1 unmatched). Its page has no **Edit quote** or **Delete** button and says "This example can't be edited or deleted." |
| 9 | Strict is the default | Open **Settings**. Or SQL: `select match_strictness from public.org_settings;` | **Strict** selected / `strict`. |
| 10 | No trackers | Signed in, open the browser's developer tools, **Network** tab, reload each page. | Every request goes to `$APP` only: no analytics, fonts or scripts from other hosts. (The browser never talks to Supabase or Anthropic directly; the app's server does.) |
| 11 | Activity is recorded without customer text | SQL editor: `select action, metadata, created_at from public.activity_log order by created_at desc limit 10;` | Rows for your `login` (`{"method": "password"}`) and `match_run` (`rows`, `matched`, `unmatched`, `judged`, `level`, `input`, `durationMs`, `outcome`) with numbers and fixed words only. |

## 9. Adding a custom domain later

1. Vercel: **Settings > Domains > Add**, enter for example `quotes.<your-domain>`, and add the DNS record
   Vercel shows at your DNS provider. Vercel issues the certificate. Optionally make
   `<project-name>.vercel.app` redirect to the new domain (same page).
2. Supabase, **Authentication > URL Configuration**: set **Site URL** to `https://quotes.<your-domain>` and
   add `https://quotes.<your-domain>/auth/confirm` to **Redirect URLs**. Keep the `vercel.app` entry until
   nobody uses that address any more.
3. Nothing in the app's environment variables names its own address, so no redeploy is needed. Sign-in
   cookies belong to each address, so people sign in once more on the new one. Reset emails sent before the
   change still point at the old address.
4. If you set up custom SMTP with a sender on the same domain, nothing changes there.

## 10. Data flow and confidentiality

Customer lists and quotes are confidential (product rule 8 in [plan.md](plan.md)).

**Where data lives.** Vercel runs the app; Supabase stores the data (catalog, saved quotes, settings,
users, the activity log) in the region you chose. The browser talks only to the app's own address: never
directly to Supabase, Anthropic or anything else (go-live check 10).

**The only external data flow is the Anthropic API**, used in two steps of a match run:

| Step | What is sent | What is not sent |
|---|---|---|
| Parse | The pasted list text, or the uploaded PDF (as a document, in memory), with instructions to split it into product lines. Whatever the customer wrote in the list goes with it. | Customer name and quote reference typed in the app, user names and emails, BOXT prices. |
| Judge | For each line whose catalog match already clears the strictness threshold: the customer's original line text, the item description read from it, and up to 8 candidate catalog items as SKU, description, pack and category. | Any price (catalog list prices and the prices reps type are never sent), customer name, reference, other lines. |

**What is not stored or logged:**

- The pasted list and the uploaded PDF are processed in memory for that one request and never stored. Only
  when a rep **saves** a quote are its lines kept (each line's original text, the chosen item, quantity and
  price, the customer's quantity as written when it was converted or flagged, and for an unmatched line
  the closest items shown), in Supabase.
- The app writes nothing about requests to its logs (it has no logging calls). Vercel's own request logs
  record the address, status and browser of each request, not request bodies; note that the Swap search
  term a rep types in the review dialog is part of a URL (`/api/catalog/search?q=...`), so it can appear
  there.
- The activity log (`activity_log`) records who did what and when, with counts, scores, thresholds and
  fixed words only: never customer names, references, line text, file names or emails. The database
  enforces this with a check constraint as well.
- No analytics, trackers, error reporting services or third-party scripts are installed.

**Anthropic's retention.** Under Anthropic's commercial terms, API inputs and outputs are deleted from
Anthropic's back end within 30 days, except where the customer has agreed otherwise (for example zero data
retention), where needed to enforce the Usage Policy, or where the law requires it; and API data is not
used for model training without express permission. Read the current terms before go-live:

- Commercial data retention: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-personal-data
- API data retention and zero data retention: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention

If BOXT's NDA with a customer requires it, ask Anthropic about a zero data retention arrangement for your
organization.

## 11. Verified locally

On 2026-10-16, against the local Supabase stack (all four migrations applied, seeded, the dev users) and
a production build of this branch with every feature merged in (`npm run build && PORT=3195 npm start`,
fixture parser and judge). Rows marked 2026-10-15 were checked the day before, against a build of the
branch at that time, and were not repeated.

| Check | Command (local equivalent of the go-live check) | Result |
|---|---|---|
| Sign-up refused | `POST /auth/v1/signup` with the anon key, and again with the publishable key | `422 signup_disabled` both times |
| Row-level security | `GET /rest/v1/<name>?select=*` for the 5 tables and the view with the anon key; `quotes` and `POST /rest/v1/rpc/create_quote` with the anon and the publishable key; `quote_lines?select=customer_quantity` with the anon key | `401 42501 permission denied` for each |
| `/signup` | signed out / signed in | `307 /login?next=%2Fsignup` / `404` |
| Pages signed out | `/`, `/quote-tool`, `/quotes`, `/settings`, `/quotes/<id>` | `307 /login?next=...` each |
| APIs signed out | `/api/quotes`, `/api/settings`, `/api/catalog/search?q=box`, `POST /api/quote-tool/match` | `401 {"error":"Sign in to continue."}` each |
| Sign-in | `POST /api/auth/login` wrong / right password | `401 "Email or password is incorrect."` / `200` |
| Choosing a password while signed in | `/update-password` with a normal session / signed out | `200` / `307 /reset-password?error=expired` |
| Cross-origin request | `POST /api/quote-tool/match` with another site's `Origin` | `403` |
| Match run (fixture mode) | `POST /api/quote-tool/match` with the two lines of go-live check 7 | NDJSON progress (parse, match, judge 1 of 1), then a `strict` result: the single wall line matched (12108-BDL, priced per each), the double wall line No match (`not_accounted`); the judge was asked about the one clearing line only; one `match_run` row `{rows 2, matched 1, unmatched 1, judged 1, level strict, input text, durationMs, outcome success}` |
| Caps | 201 lines; 60,001 characters; a 4 MB + 1 byte PDF | `413` with the "more than 200 lines" / "too long" / "larger than 4 MB" messages |
| Saved customer quantity | `POST /api/quotes` with a converted line (`customerQuantity` "10 bundles") and a flagged one ("10 pallets", `quantityUnclear`); the flagged-quantity SQL in [OPERATIONS.md](OPERATIONS.md#activity-reports-sql); then `DELETE` | `201`; both rows with `customer_quantity` and `flagged` as sent; `200` on delete |
| Example quote | `DELETE` and `PATCH /api/quotes/<example id>`; its page | `409` "The example quote can't be deleted." / "can't be edited."; the page has the Example tag and no Edit quote or Delete button |
| SQL in these docs | Every SQL block of this file and of OPERATIONS.md, with `psql` against the local database | All run without error |
| Seed | `npm run db:seed:boxt` (again, on a seeded database) | `Seeded the local database: catalog 1555 rows (0 new, 1555 updated); example quote 4 lines.` |
| No outside hosts | Signed-in `/quotes`, `/quote-tool`, `/settings` and `/login` HTML | No `http(s)://` address at all; no Supabase URL |
| Build without Supabase settings | CI's build step: no `.env.local`, `env -u NEXT_PUBLIC_SUPABASE_URL -u NEXT_PUBLIC_SUPABASE_ANON_KEY npm run build` | Passes (follow-up F1); B8's verification also showed such a build fails closed when run without them (`307` / `401` / sign-in error) |
| Password reset (2026-10-15) | `POST /api/auth/reset` for a dev user; read the email in Mailpit (`http://127.0.0.1:54324`); open its link | Email "Reset your BOXT quote tool password" with a `{{ .SiteURL }}/auth/confirm?token_hash=...&type=recovery&next=/update-password` link; `303` to `/update-password` (page `200`); the same link again: `303 /reset-password?error=expired`. The E2E suite repeats this on every run (`e2e/auth.spec.ts`). |
| Publishable key in `NEXT_PUBLIC_SUPABASE_ANON_KEY` (2026-10-15) | Production build with the publishable key; sign in, list quotes, catalog search, open `/quote-tool` | All `200`; signed out `307` |
| Failed sign-in in Auth logs (2026-10-15) | Auth server log after a wrong password | `/token` `400` `invalid_credentials` (no email in the line); `auth.audit_log_entries` has `login` and `user_recovery_requested` rows, not failed attempts |

Not verifiable locally (check on the real projects): the Supabase and Vercel dashboard steps, custom SMTP
delivery, the Session pooler connection with `sslmode=no-verify` (or `verify-full` with the downloaded
certificate), Vercel's limits and Deployment Protection, and live Claude calls (go-live check 7).
