import type Database from 'better-sqlite3';
import {readdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';

// Migration runner (decision 8, spec §1.1). Numbered SQL files in src/server/db/migrations
// (NNN_<slug>.sql, ids 001…N contiguous) run on every db() open:
// - Every file whose id (the file stem) is not in schema_migrations is applied, in numeric order: a
//   set difference, not "after the newest", so lanes that merge out of order all still apply.
// - Each file runs in its own IMMEDIATE transaction with its schema_migrations insert, so a failing
//   file rolls back whole. foreign_keys is OFF around the run (the pragma can't change inside a
//   transaction, and table rebuilds need it off), PRAGMA foreign_key_check runs after each file and
//   rolls that file back on any row, and foreign_keys is ON afterwards.
// - Adoption: a pre-T1 database (tables, meta.schema_version='4', no schema_migrations) is recorded
//   as already at 001_baseline without running it. Any other version is refused.
// No down migrations: rollback is restoring the volume backup taken before the deploy (README).

export const BASELINE='001_baseline';
const ADOPTABLE_VERSION='4';

/** Resolved from the working directory at run time, like databasePath(), so next start, vitest and tsx all find it. */
export const migrationsDir=()=>resolve(/* turbopackIgnore: true */ process.cwd(),'src/server/db/migrations');

export interface Migration{id:string;sql:string}

/** The directory's .sql files in numeric order. A misnamed .sql file throws rather than being skipped. */
export function readMigrations(dir=migrationsDir()):Migration[]{
  return readdirSync(dir).filter(name=>name.endsWith('.sql')).map(name=>{
    if(!/^\d{3}_[a-z0-9_]+\.sql$/.test(name))throw new Error(`Migration file ${name} must be named NNN_<slug>.sql (three digits, lower-case slug).`);
    return {id:name.slice(0,-4),sql:readFileSync(resolve(dir,name),'utf8')};
  }).sort((a,b)=>parseInt(a.id,10)-parseInt(b.id,10)||a.id.localeCompare(b.id));
}

const hasTable=(database:Database.Database,name:string)=>!!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
const isApplied=(database:Database.Database,id:string)=>!!database.prepare('SELECT 1 FROM schema_migrations WHERE id=?').get(id);
const record=(database:Database.Database,id:string)=>database.prepare('INSERT INTO schema_migrations(id,applied_at) VALUES(?,?)').run(id,new Date().toISOString());

/** Creates schema_migrations on a new database, adopts a v4 one, or refuses anything else. */
function prepare(database:Database.Database){
  if(hasTable(database,'schema_migrations'))return;
  const tables=database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").pluck().all() as string[];
  const version=tables.includes('meta')?database.prepare("SELECT value FROM meta WHERE key='schema_version'").pluck().get() as string|undefined:undefined;
  if(tables.length&&version!==ADOPTABLE_VERSION)
    throw new Error(`SQLite schema ${version??'(unversioned)'} at ${database.name} is incompatible with schema ${ADOPTABLE_VERSION}. Run npm run db:reset.`);
  database.exec('CREATE TABLE schema_migrations(id TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');
  if(tables.length)record(database,BASELINE);
}

/**
 * Brings `database` up to date and returns the ids applied, in order. Inside a caller's transaction
 * (reseedDatabase) each file becomes a savepoint, and the caller owns the foreign_keys pragma.
 */
export function migrate(database:Database.Database,{dir=migrationsDir()}:{dir?:string}={}):string[]{
  const migrations=readMigrations(dir);
  const outer=database.inTransaction;
  if(!outer)database.pragma('foreign_keys = OFF');
  try{
    database.transaction(()=>prepare(database)).immediate();
    const applied:string[]=[];
    for(const {id,sql} of migrations){
      // Re-checked inside the write lock, so two processes opening the database at once apply a file once.
      database.transaction(()=>{
        if(isApplied(database,id))return;
        try{database.exec(sql);}catch(error){throw new Error(`Migration ${id} failed: ${(error as Error).message}`,{cause:error});}
        const dangling=database.pragma('foreign_key_check') as unknown[];
        if(dangling.length)throw new Error(`Migration ${id} failed: it leaves ${dangling.length} foreign key violation(s), e.g. ${JSON.stringify(dangling[0])}.`);
        record(database,id);
        applied.push(id);
      }).immediate();
    }
    return applied;
  }finally{if(!outer)database.pragma('foreign_keys = ON');}
}
