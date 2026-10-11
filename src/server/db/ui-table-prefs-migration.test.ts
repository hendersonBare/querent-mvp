import Database from 'better-sqlite3';
import {copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {migrate,migrationsDir,readMigrations} from './migrate';

// 009_ui_table_prefs (plan U0; new-ui-implementation-prompt Appendix C "ui_table_prefs"): one row of
// column order and hidden columns per (user, table). Both lists are JSON arrays of column ids.

const TARGET='009_ui_table_prefs';
let dir='';
let database:Database.Database;
beforeEach(()=>{
  dir=mkdtempSync(join(tmpdir(),'querent-009-'));
  for(const m of readMigrations().filter(m=>m.id<=TARGET))copyFileSync(join(migrationsDir(),`${m.id}.sql`),join(dir,`${m.id}.sql`));
  database=new Database(':memory:');
  database.pragma('foreign_keys = ON');
  migrate(database,{dir});
});
afterEach(()=>{database.close();rmSync(dir,{recursive:true,force:true});});

const insert=(row:Record<string,unknown>)=>database.prepare('INSERT INTO ui_table_prefs(user_id,table_id,column_order,hidden_columns) VALUES(@user_id,@table_id,@column_order,@hidden_columns)').run(row);
const ROW={user_id:'mara',table_id:'quotes',column_order:'["quote","customer"]',hidden_columns:'["rep"]'};

describe('migration 009_ui_table_prefs',()=>{
  it('is applied in order after 008',()=>{
    expect(readMigrations().map(m=>m.id)).toContain(TARGET);
    expect(database.prepare('SELECT id FROM schema_migrations ORDER BY id').pluck().all().at(-1)).toBe(TARGET);
  });

  it('keeps one row per user and table',()=>{
    insert(ROW);
    insert({...ROW,table_id:'customers'});
    insert({...ROW,user_id:'eli'});
    expect(()=>insert({...ROW,column_order:'[]'})).toThrow(/UNIQUE|PRIMARY KEY/);
    expect(database.prepare('SELECT count(*) FROM ui_table_prefs').pluck().get()).toBe(3);
  });

  it('refuses lists that are not JSON arrays, and missing values',()=>{
    expect(()=>insert({...ROW,column_order:'quote,customer'})).toThrow(/CHECK/);
    expect(()=>insert({...ROW,hidden_columns:'{"rep":true}'})).toThrow(/CHECK/);
    expect(()=>insert({...ROW,user_id:null})).toThrow(/NOT NULL/);
    expect(()=>insert({...ROW,table_id:null})).toThrow(/NOT NULL/);
    expect(()=>insert({...ROW,column_order:null})).toThrow(/NOT NULL/);
    expect(()=>insert({...ROW,hidden_columns:null})).toThrow(/NOT NULL/);
  });
});
