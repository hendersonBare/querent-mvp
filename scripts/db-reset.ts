// npm run db:reset — LOCAL STACK ONLY. Rebuilds the local Supabase database from scratch:
//   1. `supabase db reset --local`: drops the local database and applies supabase/migrations/;
//   2. the BOXT seed (scripts/seed-boxt.ts): catalog and example quote;
//   3. the local dev users, through the Auth admin API with the local stack's service-role key (read
//      at run time from `supabase status`, never written anywhere or printed):
//        rep@boxt.test and rep2@boxt.test, password QUERENT_DEV_PASSWORD or the local-only default in
//        scripts/lib/dev-users.ts (not a secret: it exists only on a local stack).
// It refuses to run unless the API URL and DATABASE_URL (shell, then .env.local, then the stack's own)
// point at 127.0.0.1 or localhost. Idempotent: run it as often as you like. Start the stack first
// with `npm run db:start`.
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {DEV_USERS,devPassword} from './lib/dev-users';
import {isLocalUrl,loadEnvLocal} from './lib/env';
import {ROOT,supabaseStatusEnv} from './lib/local-supabase';
import {seedBoxt} from './seed-boxt';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function createDevUsers(apiUrl:string,adminKey:string){
  const admin=createClient(apiUrl,adminKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const password=devPassword();
  // Auth restarts after a reset: wait until it answers.
  let existing:Map<string,string>|null=null;
  for(let attempt=0;attempt<60&&!existing;attempt++){
    const {data,error}=await admin.auth.admin.listUsers({page:1,perPage:1000});
    if(!error)existing=new Map(data.users.map(u=>[u.email??'',u.id]));
    else await sleep(1000);
  }
  if(!existing)throw new Error('The local Auth service did not answer within a minute.');
  for(const {email} of DEV_USERS){
    const id=existing.get(email);
    const {error}=id
      ?await admin.auth.admin.updateUserById(id,{password,email_confirm:true})
      :await admin.auth.admin.createUser({email,password,email_confirm:true});
    if(error)throw new Error(`Could not ${id?'update':'create'} ${email}: ${error.message}`);
  }
}

async function main(){
  loadEnvLocal(ROOT);
  const status=supabaseStatusEnv();
  const apiUrl=process.env.NEXT_PUBLIC_SUPABASE_URL||status.API_URL;
  const databaseUrl=process.env.DATABASE_URL||status.DB_URL;
  if(!isLocalUrl(apiUrl)||!isLocalUrl(databaseUrl)||!isLocalUrl(status.API_URL)||!isLocalUrl(status.DB_URL)){
    console.error('db:reset works on the local Supabase stack only: the API URL and DATABASE_URL must point at 127.0.0.1 or localhost. Nothing was changed.');
    process.exit(1);
  }

  console.log('Resetting the local database and applying migrations...');
  execFileSync('npx',['supabase','db','reset','--local'],{cwd:ROOT,stdio:['ignore','inherit','inherit']});

  const counts=await seedBoxt(databaseUrl);
  console.log(`Seeded: catalog ${counts.catalogRows} rows; example quote ${counts.exampleLines} lines.`);

  await createDevUsers(status.API_URL,status.SERVICE_ROLE_KEY);
  console.log(`Dev users ready: ${DEV_USERS.map(u=>u.email).join(', ')} (password: QUERENT_DEV_PASSWORD, else the local default in scripts/lib/dev-users.ts).`);
}

main().catch(error=>{
  console.error(`db:reset failed: ${error instanceof Error?error.message:String(error)}`);
  process.exit(1);
});
