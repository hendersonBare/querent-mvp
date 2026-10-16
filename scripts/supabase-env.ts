// npm run db:env — writes .env.local (git-ignored) for local development from the running local stack
// (`supabase status`): the Supabase URL and anon key for the app, the local service-role key for the
// scripts, DATABASE_URL, QUERENT_SCRIPTED=1 (fixture parser and judge) and MAILPIT_URL (the test suites'
// mail catcher). Every other line already in .env.local (ANTHROPIC_API_KEY, ANTHROPIC_MODEL, PORT,
// comments) is kept as it was. Values are never printed. Start the stack first with `npm run db:start`.
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {isLocalUrl,mergeEnvFile} from './lib/env';
import {ROOT,supabaseStatusEnv} from './lib/local-supabase';

function main(){
  const status=supabaseStatusEnv();
  if(!isLocalUrl(status.API_URL)||!isLocalUrl(status.DB_URL))throw new Error('supabase status did not report a local stack.');
  const values:Record<string,string>={
    NEXT_PUBLIC_SUPABASE_URL:status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,
    DATABASE_URL:status.DB_URL,
    QUERENT_SCRIPTED:'1',
  };
  // The local mail catcher (password-reset emails), for the test:db and E2E suites; the app never reads it.
  if(status.MAILPIT_URL)values.MAILPIT_URL=status.MAILPIT_URL;
  const file=join(ROOT,'.env.local');
  const existing=existsSync(file)?readFileSync(file,'utf8'):'';
  writeFileSync(file,mergeEnvFile(existing,values),{mode:0o600});
  console.log(`Wrote .env.local: ${Object.keys(values).length} keys from the local stack; other lines kept.`);
}

try{main();}catch(error){
  console.error(`db:env failed: ${error instanceof Error?error.message:String(error)}`);
  process.exit(1);
}
