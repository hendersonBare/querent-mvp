import {createClient} from '@supabase/supabase-js';
import type {Database,Db} from '../../src/server/repository/types';
import {devPassword} from './dev-users';

// Supabase clients for the test:db suite, built the way the app builds them: the project URL and the
// anon key only. A signed-in client carries that user's session, so RLS applies to everything it does.

function publicEnv(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!anonKey)throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not set (run the suite with npm run test:db).');
  return {url,anonKey};
}

/** A client with the anon key and no session. */
export function anonClient():Db{
  const {url,anonKey}=publicEnv();
  return createClient<Database>(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}

/** A client signed in as one of the local dev users (npm run db:reset creates them). */
export async function signedInClient(email:string,password=devPassword()):Promise<{db:Db;userId:string}>{
  const db=anonClient();
  const {data,error}=await db.auth.signInWithPassword({email,password});
  if(error||!data.user)throw new Error(`Could not sign in as ${email} (${error?.message??'no user'}). Run npm run db:reset first.`);
  return {db,userId:data.user.id};
}
