import {defineConfig} from 'vitest/config';
import path from 'node:path';
import {dbTestEnv} from './scripts/lib/local-supabase';

// npm run test:db: the repository, RLS and auth checks against the LOCAL Supabase stack
// (`npm run db:start && npm run db:reset` first). `npm test` never runs these (*.db.test.ts is excluded
// there). The URL, anon key and DATABASE_URL come from the shell when set, else from `supabase status`.
export default defineConfig({
  resolve:{alias:{'@':path.resolve(__dirname,'src'),'server-only':path.resolve(__dirname,'src/test/server-only.ts')}},
  test:{
    environment:'node',
    include:['src/**/*.db.test.ts'],
    env:dbTestEnv(),
    fileParallelism:false,
    testTimeout:30_000,
    hookTimeout:60_000,
  },
});
