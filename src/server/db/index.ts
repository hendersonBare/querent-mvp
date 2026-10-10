import Database from 'better-sqlite3';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {migrate} from './migrate';
import {seedAnchorFromEnv,seedDatabase} from './seed';

export const databasePath=()=>resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH||'./data/querent.sqlite');
let singleton:Database.Database|undefined;

export function db(){
  if(singleton)return singleton;
  const path=databasePath();
  mkdirSync(dirname(path),{recursive:true});
  const database=new Database(path);
  try{
    database.pragma('journal_mode = WAL');
    database.pragma('foreign_keys = ON');
    bootstrap(database);
  }catch(error){database.close();throw error;}
  singleton=database;
  return singleton;
}

// Every open applies the pending migrations (spec §1.1, ./migrate.ts): a pre-T1 v4 database is
// adopted, any other unmigrated one refuses to open and `npm run db:reset` rebuilds it. A new,
// empty database is seeded on first open.
function bootstrap(database:Database.Database){
  migrate(database);
  // IMMEDIATE takes the write lock before the emptiness check, so two processes opening a new
  // database at once cannot both seed it.
  database.transaction(()=>{if(!database.prepare('SELECT count(*) FROM customers').pluck().get())seedDatabase(database,{anchor:seedAnchorFromEnv()});}).immediate();
}

/**
 * Drops every table, runs every migration and reseeds on the open connection, so the file stays in
 * place and any other connection to it (another process, or another copy of this module in a server
 * bundle) sees the fresh seed. `npm run db:reset` deletes the file instead, which also clears an incompatible schema.
 * Returns the seed anchor used.
 */
export function reseedDatabase({anchor=seedAnchorFromEnv()}:{anchor?:string}={}){
  const database=db();
  const objects=database.prepare("SELECT type,name FROM sqlite_master WHERE type IN ('view','table') AND name NOT LIKE 'sqlite_%' ORDER BY type='table'").all() as {type:'view'|'table';name:string}[];
  // foreign_keys can't change inside a transaction, so it is switched off around it.
  database.pragma('foreign_keys = OFF');
  try{
    database.transaction(()=>{
      for(const {type,name} of objects)database.exec(`DROP ${type.toUpperCase()} IF EXISTS "${name.replaceAll('"','""')}"`);
      migrate(database);
      seedDatabase(database,{anchor});
    }).immediate();
  }finally{database.pragma('foreign_keys = ON');}
  return anchor;
}

/** The day the seed is anchored to (YYYY-MM-DD); see seed/dates.ts. */
export function seedAnchor(){return db().prepare("SELECT value FROM meta WHERE key='seed_anchor'").pluck().get() as string;}

export function closeDatabase(){singleton?.close();singleton=undefined;}
