import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {isLocalUrl} from '../scripts/lib/env';
import {SCREENSHOTS} from './support/helpers';
import {ROOT} from './support/stack';

// Before any spec: the suite writes to the database and signs in as the local dev users, so it runs
// against the LOCAL stack only. `npm run db:reset` rebuilds the database (migrations, the BOXT catalog,
// the example quote, the dev users), so every run starts from the same data. db:reset itself refuses a
// stack that is not on this machine.
export default async function globalSetup(){
  const {NEXT_PUBLIC_SUPABASE_URL:url,NEXT_PUBLIC_SUPABASE_ANON_KEY:anonKey,DATABASE_URL:databaseUrl}=process.env;
  if(!url||!anonKey||!databaseUrl){
    throw new Error('The E2E suite needs the local Supabase stack: run `npm run db:start` (and `npm run db:env`), then try again.');
  }
  if(!isLocalUrl(url)||!isLocalUrl(databaseUrl)){
    throw new Error('The E2E suite runs against the local Supabase stack only (127.0.0.1 or localhost). Nothing was changed.');
  }
  execFileSync('npm',['run','db:reset'],{cwd:ROOT,stdio:['ignore','inherit','inherit']});
  mkdirSync(SCREENSHOTS,{recursive:true});
}
