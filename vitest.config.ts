import {configDefaults,defineConfig} from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
// The 'server-only' alias lets tests import server modules that guard themselves with it.
// src/server/matching/catalog.test.ts seeds the SQLite database B0 removed; task B3 (which owns
// src/server/matching) replaces it. Until it does, it is left out here and in tsconfig.json.
export default defineConfig({plugins:[react()],resolve:{alias:{'@':path.resolve(__dirname,'src'),'server-only':path.resolve(__dirname,'src/test/server-only.ts')}},test:{environment:'jsdom',setupFiles:['./vitest.setup.ts'],include:['src/**/*.test.{ts,tsx}'],exclude:[...configDefaults.exclude,'src/server/matching/catalog.test.ts'],fileParallelism:false}});
