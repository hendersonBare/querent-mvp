import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {isLocalUrl,parseDotenv} from './env';

// The local Supabase stack's URLs and keys, read at run time from `npx supabase status -o env`.
// They are generated per machine, never committed and never printed.

export const ROOT=resolve(__dirname,'../..');

/** The stack's status as env pairs (API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL, MAILPIT_URL, ...). */
export function supabaseStatusEnv():Record<string,string>{
  let out:string;
  try{
    out=execFileSync('npx',['supabase','status','-o','env'],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  }catch{
    throw new Error('The local Supabase stack is not running. Start it with `npm run db:start`.');
  }
  const env=parseDotenv(out);
  if(!env.API_URL||!env.ANON_KEY||!env.DB_URL)throw new Error('`supabase status -o env` did not report API_URL, ANON_KEY and DB_URL.');
  return env;
}

/**
 * The env the test:db suite runs with: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
 * DATABASE_URL from the shell when set (CI), else from the local stack. It refuses anything that is not
 * on this machine: the suite writes to the database.
 */
export function dbTestEnv():Record<string,string>{
  const shell={url:process.env.NEXT_PUBLIC_SUPABASE_URL,anonKey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,databaseUrl:process.env.DATABASE_URL};
  const status=shell.url&&shell.anonKey&&shell.databaseUrl?null:supabaseStatusEnv();
  const env={
    NEXT_PUBLIC_SUPABASE_URL:shell.url||status!.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:shell.anonKey||status!.ANON_KEY,
    DATABASE_URL:shell.databaseUrl||status!.DB_URL,
  };
  if(!isLocalUrl(env.NEXT_PUBLIC_SUPABASE_URL)||!isLocalUrl(env.DATABASE_URL))throw new Error('test:db runs against the local stack only (127.0.0.1 or localhost).');
  return env;
}
