# Querent MVP

Querent is a fictional customer self-service demonstration. It is one full-stack Next.js application backed by a local SQLite file. There is no Supabase account, Python service, container, migration command, or login setup.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Open <http://localhost:3000>. Choose the supplier persona (Herrick Industrial Supply, signed in as rep Brandi Gallegos) or the customer persona (Dana Ortiz at Wasatch Mechanical Contractors). All displayed companies, people, and records are fictional.

The database is created and seeded automatically at `./data/querent.sqlite`. State survives restarts. To return to the original seed:

```sh
npm run db:reset
```

Seeded dates are relative to a seed date, which defaults to yesterday so the demo stays current. Set `QUERENT_SEED_DATE=2026-09-23` before `npm run db:reset` to reproduce the design mockup's dates exactly. After a schema change (`SCHEMA_VERSION` in `src/server/db/schema.ts`), the app refuses to open an older database until you run `npm run db:reset`; there are no migrations.

All data access goes through typed functions in `src/server/repository/` (types in `src/domain/`). `@/server/repository` is the full internal API. Customer-facing code and the chat tools use `@/server/repository/customer`, which never returns cost or margin. `npm test` fails if SQL appears anywhere else.

Chat is being rebuilt for Query to Quote. Until the scripted and tool-calling chat land, every question gets a holding answer that points to the customer's rep.

## Verify and run a production build

```sh
npm test
npm run typecheck
npm run build
npm start
```

## Railway

1. Push this directory to a GitHub repository and create a Railway service from it.
2. Use `npm run build` as the build command and `npm start` as the start command.
3. Add a persistent volume mounted at `/data`.
4. Set `DATABASE_PATH=/data/querent.sqlite`.
5. Optionally set `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`.
6. Generate a public HTTPS domain and open it from your phone.

Railway's free credit is suitable for experimentation, but continuous free operation depends on usage. Free and trial volume limits can also change. Vercel cannot durably persist this local SQLite file; a future Vercel deployment should replace it with remote libSQL/Turso.

## Security boundary

The workspace chooser is intentionally not authentication. Anyone with the URL can view and change fictional demo state. Do not put real customer, financial, or personal data in this version.
