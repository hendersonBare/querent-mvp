import {defineConfig,devices} from '@playwright/test';
import {freePort,resolveStackEnv,STACK_KEYS} from './e2e/support/stack';

// The E2E suite (docs/boxt/plan.md B8; how to run it: e2e/README.md). Fixture LLMs (QUERENT_SCRIPTED=1,
// no API key), the LOCAL Supabase stack, and the production server (`npm run build` first).
//
//   - globalSetup (e2e/global-setup.ts) refuses a non-local stack and runs `npm run db:reset`.
//   - webServer runs `npm run start` on a free port with the stack's URL and anon key, QUERENT_SCRIPTED=1
//     and ANTHROPIC_API_KEY=''. next start loads .env.local but never overrides a variable already set
//     (even to ''), so a real key in .env.local can never reach it. Set QUERENT_BASE_URL to run the
//     specs against a server you started yourself instead (QUERENT_WEBSERVER=1 starts one there anyway).
//   - The `setup` project signs in as the dev user once (e2e/auth.setup.ts); the specs reuse the session.
//
// This file loads in the runner and again in every worker: the port and the stack variables are put
// in process.env the first time, so every process sees the same values.

const stack=resolveStackEnv();
for(const key of STACK_KEYS)if(!process.env[key]&&stack[key])process.env[key]=stack[key];

const external=process.env.QUERENT_BASE_URL;
const startServer=!external||process.env.QUERENT_WEBSERVER==='1';
if(!external&&!process.env.QUERENT_E2E_PORT)process.env.QUERENT_E2E_PORT=String(freePort());
const baseURL=external||`http://127.0.0.1:${process.env.QUERENT_E2E_PORT}`;
const port=new URL(baseURL).port||'3000';

/** Chromium for this Playwright version (`npx playwright install chromium`), or another build of it. */
const executablePath=process.env.QUERENT_E2E_CHROMIUM||undefined;

const serverEnv:Record<string,string>={
  PORT:port,
  QUERENT_SCRIPTED:'1',
  ANTHROPIC_API_KEY:'',
  NEXT_TELEMETRY_DISABLED:'1',
};
if(process.env.NEXT_PUBLIC_SUPABASE_URL)serverEnv.NEXT_PUBLIC_SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL;
if(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default defineConfig({
  testDir:'./e2e',
  globalSetup:'./e2e/global-setup.ts',
  timeout:90_000,
  expect:{timeout:15_000},
  fullyParallel:false,
  workers:1,
  retries:0,
  forbidOnly:!!process.env.CI,
  reporter:process.env.CI
    ?[['list'],['github'],['html',{open:'never'}]]
    :[['list'],['html',{open:'never'}]],
  use:{
    baseURL,
    viewport:{width:1440,height:900},
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'retain-on-failure',
    launchOptions:executablePath?{executablePath}:{},
  },
  projects:[
    // Signs in once and saves the session to e2e/.auth/rep.json (git-ignored).
    {name:'setup',testMatch:/auth\.setup\.ts$/},
    {
      name:'chromium',
      dependencies:['setup'],
      use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900},storageState:'e2e/.auth/rep.json'},
    },
  ],
  webServer:startServer
    ?{
        // Requires a prior `npm run build`.
        command:'npm run start',
        url:`${baseURL}/login`,
        reuseExistingServer:false,
        timeout:120_000,
        stdout:'pipe',
        stderr:'pipe',
        env:serverEnv,
      }
    :undefined,
});
