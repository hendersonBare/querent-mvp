import {configDefaults,defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
// The 'server-only' alias lets tests import server modules that guard themselves with it.
// *.db.test.ts files need the local Supabase stack and run only in npm run test:db (vitest.db.config.ts).
export default defineConfig({plugins:[react()],resolve:{alias:{'@':path.resolve(__dirname,'src'),'server-only':path.resolve(__dirname,'src/test/server-only.ts')}},test:{environment:'jsdom',setupFiles:['./vitest.setup.ts'],include:['src/**/*.test.{ts,tsx}','scripts/**/*.test.ts'],exclude:[...configDefaults.exclude,'**/*.db.test.ts'],fileParallelism:false}});
