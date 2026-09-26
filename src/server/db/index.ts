import Database from 'better-sqlite3';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {applySchema,SCHEMA_VERSION} from './schema';
import {seedAnchorFromEnv,seedDatabase} from './seed';

export {SCHEMA_VERSION} from './schema';
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

// No migrations (spec §6.6): a database from another schema version refuses to open, and
// `npm run db:reset` deletes it and reseeds. A new, empty database is seeded on first open.
function bootstrap(database:Database.Database){
  const tables=database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").pluck().all() as string[];
  if(tables.length){
    const version=tables.includes('meta')?database.prepare("SELECT value FROM meta WHERE key='schema_version'").pluck().get() as string|undefined:undefined;
    if(Number(version)!==SCHEMA_VERSION)throw new Error(`SQLite schema ${version??'(unversioned)'} at ${databasePath()} is incompatible with schema ${SCHEMA_VERSION}. Run npm run db:reset.`);
  }
  applySchema(database);
  database.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES('schema_version',?)").run(String(SCHEMA_VERSION));
  // IMMEDIATE takes the write lock before the emptiness check, so two processes opening a new
  // database at once cannot both seed it.
  database.transaction(()=>{if(!database.prepare('SELECT count(*) FROM customers').pluck().get())seedDatabase(database,{anchor:seedAnchorFromEnv()});}).immediate();
}

/** The day the seed is anchored to (YYYY-MM-DD); see seed/dates.ts. */
export function seedAnchor(){return db().prepare("SELECT value FROM meta WHERE key='seed_anchor'").pluck().get() as string;}

export function closeDatabase(){singleton?.close();singleton=undefined;}
