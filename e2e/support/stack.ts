import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {parseDotenv} from '../../scripts/lib/env';

// Where the E2E suite finds the local Supabase stack and which port its server gets. Read by
// playwright.config.ts when it loads (in the runner and again in each worker), so everything here is
// synchronous and never throws: a stack that is not running leaves values unset, and global-setup.ts
// refuses to run with a clear message. Values are never printed.

export const ROOT=resolve(__dirname,'../..');

/** The stack variables the suite and its server need, and their names in `supabase status -o env`. */
const FROM_STATUS={
  NEXT_PUBLIC_SUPABASE_URL:'API_URL',
  NEXT_PUBLIC_SUPABASE_ANON_KEY:'ANON_KEY',
  DATABASE_URL:'DB_URL',
  MAILPIT_URL:'MAILPIT_URL',
} as const;
export type StackKey=keyof typeof FROM_STATUS;
export const STACK_KEYS=Object.keys(FROM_STATUS) as StackKey[];

function envLocal():Record<string,string>{
  const file=join(ROOT,'.env.local');
  return existsSync(file)?parseDotenv(readFileSync(file,'utf8')):{};
}

function supabaseStatus():Record<string,string>{
  try{
    return parseDotenv(execFileSync('npx',['supabase','status','-o','env'],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:30_000}));
  }catch{
    return {};
  }
}

/**
 * The stack's URL, anon key, DATABASE_URL and Mailpit URL: the shell first (CI), then .env.local
 * (`npm run db:env`), then `supabase status` (asked only when something is still missing).
 */
export function resolveStackEnv():Partial<Record<StackKey,string>>{
  const local=envLocal();
  const out:Partial<Record<StackKey,string>>={};
  for(const key of STACK_KEYS){const value=process.env[key]||local[key];if(value)out[key]=value;}
  if(STACK_KEYS.some(key=>!out[key]&&key!=='MAILPIT_URL')){
    const status=supabaseStatus();
    for(const key of STACK_KEYS)if(!out[key]&&status[FROM_STATUS[key]])out[key]=status[FROM_STATUS[key]];
  }
  out.MAILPIT_URL??='http://127.0.0.1:54324';
  return out;
}

/** A TCP port nothing listens on right now (asked of the OS in a child process, so this stays synchronous). */
export function freePort():number{
  const script="const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close();});";
  return Number(execFileSync(process.execPath,['-e',script],{encoding:'utf8'}));
}
