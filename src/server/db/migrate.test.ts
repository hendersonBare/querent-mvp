import Database from 'better-sqlite3';
import {copyFileSync,mkdtempSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {migrate,migrationsDir,readMigrations} from './migrate';
import {createV4Database,masterOf,v4Schema} from './test-v4';

// Migration runner (spec §1.1, test plan §12 "Migrations").
let dir='';
let database:Database.Database;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'querent-migrations-'));database=new Database(':memory:');database.pragma('foreign_keys = ON');});
afterEach(()=>{database.close();rmSync(dir,{recursive:true,force:true});});

const baseline=()=>copyFileSync(join(migrationsDir(),'001_baseline.sql'),join(dir,'001_baseline.sql'));
const file=(name:string,sql:string)=>writeFileSync(join(dir,name),sql);
const applied=()=>database.prepare('SELECT id FROM schema_migrations ORDER BY rowid').pluck().all();
const columns=(table:string)=>database.prepare(`SELECT name FROM pragma_table_info('${table}')`).pluck().all();

describe('migrations directory',()=>{
  it('resolves from the working directory and holds contiguous ids 001…N',()=>{
    expect(migrationsDir()).toBe(join(process.cwd(),'src/server/db/migrations'));
    const names=readdirSync(migrationsDir()).filter(n=>n.endsWith('.sql')).sort();
    expect(names[0]).toBe('001_baseline.sql');
    names.forEach((name,i)=>expect(name).toMatch(new RegExp(`^${String(i+1).padStart(3,'0')}_[a-z0-9_]+\\.sql$`)));
    expect(readMigrations().map(m=>`${m.id}.sql`)).toEqual(names);
  });

  it('rejects a misnamed migration file',()=>{
    file('2_bad.sql','SELECT 1;');
    expect(()=>readMigrations(dir)).toThrow(/2_bad\.sql/);
  });
});

describe('migrate',()=>{
  it('builds an empty database from 001…N and records each id once',()=>{
    expect(migrate(database)).toEqual(readMigrations().map(m=>m.id));
    expect(applied()[0]).toBe('001_baseline');
    expect(database.prepare("SELECT applied_at FROM schema_migrations WHERE id='001_baseline'").pluck().get()).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    expect(migrate(database)).toEqual([]);
    expect(database.pragma('foreign_keys',{simple:true})).toBe(1);
  });

  it('builds from 001 exactly the sqlite_master the pre-T1 applySchema() built (v4 fixture)',()=>{
    baseline();
    migrate(database,{dir});
    expect(masterOf(database)).toEqual(v4Schema());
    expect(database.prepare("SELECT value FROM meta WHERE key='schema_version'").pluck().get()).toBe('4');
  });

  it('adopts a v4 database as already at 001 without running it, then applies later files',()=>{
    createV4Database(database);
    database.prepare("INSERT INTO settings(key,value) VALUES('kept','yes')").run();
    baseline();
    file('002_widen.sql','ALTER TABLE settings ADD COLUMN note TEXT;');
    // Running 001 again would fail on "table meta already exists", so success proves it was skipped.
    expect(migrate(database,{dir})).toEqual(['002_widen']);
    expect(applied()).toEqual(['001_baseline','002_widen']);
    expect(columns('settings')).toContain('note');
    expect(database.prepare("SELECT value FROM settings WHERE key='kept'").pluck().get()).toBe('yes');
  });

  it('refuses a database from another schema version, or with no version, and says to run db:reset',()=>{
    createV4Database(database,'3');
    baseline();
    expect(()=>migrate(database,{dir})).toThrow(/SQLite schema 3 at .* is incompatible with schema 4\. Run npm run db:reset\./);
    expect(database.prepare("SELECT count(*) FROM sqlite_master WHERE name='schema_migrations'").pluck().get()).toBe(0);
    const bare=new Database(':memory:');
    try{
      bare.exec('CREATE TABLE parts_stock(id TEXT PRIMARY KEY);');
      expect(()=>migrate(bare,{dir})).toThrow(/\(unversioned\).*npm run db:reset/);
    }finally{bare.close();}
  });

  it('rolls a failing file back and leaves schema_migrations unchanged',()=>{
    baseline();
    migrate(database,{dir});
    file('002_broken.sql','CREATE TABLE half_done(id TEXT);\nINSERT INTO no_such_table VALUES(1);');
    expect(()=>migrate(database,{dir})).toThrow(/002_broken.*no_such_table/);
    expect(applied()).toEqual(['001_baseline']);
    expect(database.prepare("SELECT count(*) FROM sqlite_master WHERE name='half_done'").pluck().get()).toBe(0);
    expect(database.pragma('foreign_keys',{simple:true})).toBe(1);
  });

  it('rolls a file back when it leaves a dangling foreign key',()=>{
    baseline();
    file('002_dangling.sql',"INSERT INTO quote_notes(quote_id,rep_id,body,created_at) VALUES('no-quote','no-rep','x','2026-01-01');");
    expect(()=>migrate(database,{dir})).toThrow(/002_dangling.*foreign key/i);
    expect(applied()).toEqual(['001_baseline']);
    expect(database.prepare('SELECT count(*) FROM quote_notes').pluck().get()).toBe(0);
    expect(database.pragma('foreign_keys',{simple:true})).toBe(1);
  });

  it('applies every unrecorded file in numeric order, even one older than the newest applied (set difference)',()=>{
    baseline();
    file('003_later.sql','CREATE TABLE later(id TEXT);');
    expect(migrate(database,{dir})).toEqual(['001_baseline','003_later']);
    // Another lane's 002 merges after 003 was applied: it still runs.
    file('002_earlier.sql','CREATE TABLE earlier(id TEXT);');
    file('004_last.sql','CREATE TABLE last(id TEXT);');
    expect(migrate(database,{dir})).toEqual(['002_earlier','004_last']);
    expect(applied()).toEqual(['001_baseline','003_later','002_earlier','004_last']);
  });
});
