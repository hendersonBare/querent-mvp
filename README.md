# Querent MVP

Querent is a fictional customer self-service demonstration. It is one full-stack Next.js application backed by a local SQLite file. There is no Supabase account, Python service, container, migration command, or login setup.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Open <http://localhost:3000>. Choose the supplier, Wasatch, or Bonneville workspace. All displayed companies, people, and records are fictional.

The database is created and seeded automatically at `./data/querent.sqlite`. State survives restarts. To return to the original seed:

```sh
npm run db:reset
```

Without `ANTHROPIC_API_KEY`, chat supports the exact questions in [docs/golden-questions.md](docs/golden-questions.md). Copy `.env.example` to `.env.local` and add a key to enable open-ended Claude questions. A configured Claude error returns a safe error and never switches to the deterministic fallback.

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
