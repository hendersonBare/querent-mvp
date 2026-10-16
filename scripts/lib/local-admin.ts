import {Client} from 'pg';
import {isLocalUrl} from './env';

// A direct Postgres connection to the LOCAL stack (DATABASE_URL), for the test:db suite's checks that
// no app user can make (reading the activity log, cleaning up test quotes, probing the triggers). It
// bypasses RLS, so it refuses any DATABASE_URL that is not on this machine. Never import it from app code
// (the boundary test allows it in test files only).

export type Row=Record<string,any>;
export type Query=(sql:string,params?:unknown[])=>Promise<Row[]>;

function localDatabaseUrl(){
  const url=process.env.DATABASE_URL;
  if(!url)throw new Error('DATABASE_URL is not set (npm run test:db sets it from the local stack).');
  if(!isLocalUrl(url))throw new Error('local-admin connects to a local database only (127.0.0.1 or localhost).');
  return url;
}

async function withClient<T>(fn:(client:Client)=>Promise<T>):Promise<T>{
  const client=new Client({connectionString:localDatabaseUrl()});
  await client.connect();
  try{return await fn(client);}finally{await client.end();}
}

/** Runs one statement and returns its rows. */
export const adminQuery:Query=(sql,params=[])=>withClient(async client=>(await client.query(sql,params as unknown[])).rows);

/** Runs `fn` in one transaction, committed unless `rollback` is set (then nothing it did stays). */
export function adminTransaction(fn:(query:Query)=>Promise<void>,{rollback=false}:{rollback?:boolean}={}):Promise<void>{
  return withClient(async client=>{
    await client.query('begin');
    try{
      await fn(async(sql,params=[])=>(await client.query(sql,params as unknown[])).rows);
      await client.query(rollback?'rollback':'commit');
    }catch(error){
      await client.query('rollback');
      throw error;
    }
  });
}
