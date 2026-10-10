import Database from 'better-sqlite3';
import {copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {migrate,migrationsDir,readMigrations} from './migrate';

// 007_original_rep (v3 spec §1.2 "original_rep" row, §8; decision 21; task D2): quotes gain
// original_rep_id, the quote's first owner, kept when a manager reassigns the quote (quotes.rep_id
// is the current owner). Added column only, backfilled from rep_id; it references reps.

const TARGET='007_original_rep';
const BEFORE=readMigrations().filter(m=>m.id<TARGET).map(m=>`${m.id}.sql`);
let dir='';
let database:Database.Database;
beforeEach(()=>{
  dir=mkdtempSync(join(tmpdir(),'querent-007-'));
  for(const name of BEFORE)copyFileSync(join(migrationsDir(),name),join(dir,name));
  database=new Database(':memory:');
  database.pragma('foreign_keys = ON');
  migrate(database,{dir});
});
afterEach(()=>{database.close();rmSync(dir,{recursive:true,force:true});});

const exec=(sql:string,...params:unknown[])=>database.prepare(sql).run(...params);
const rows=(sql:string)=>database.prepare(sql).all() as Record<string,unknown>[];
function toTarget(){
  copyFileSync(join(migrationsDir(),`${TARGET}.sql`),join(dir,`${TARGET}.sql`));
  return migrate(database,{dir});
}

function seedQuotes(){
  exec(`INSERT INTO branches(id,code,name,address,city,state,zip,lat,lng,will_call_phone,will_call_hours) VALUES('slc','SLC','Salt Lake','1 Test Way','Salt Lake City','UT','84101',40.7,-111.9,'','7-4')`);
  exec(`INSERT INTO customers(id,account_number,name) VALUES('wasatch','W-1','Wasatch')`);
  exec(`INSERT INTO reps(id,name,initials,title,phone,email) VALUES('brandi','Brandi Test','BT','Rep','',''),('mara','Mara Test','MT','Rep','','')`);
  for(const [id,rep] of [['q-1','brandi'],['q-2','mara']])exec(`INSERT INTO quotes(id,quote_number,customer_id,rep_id,status,requested_at,created_at,updated_at,fulfillment,branch_id)
    VALUES(?,?,'wasatch',?,'ready_for_review','2026-09-04T00:00:00.000Z','2026-09-04T00:00:00.000Z','2026-09-04T00:00:00.000Z','will_call','slc')`,id,id.toUpperCase(),rep);
}

describe('migration 007_original_rep',()=>{
  it('adds original_rep_id and backfills it from rep_id for every existing quote',()=>{
    seedQuotes();
    expect(toTarget()).toEqual([TARGET]);
    expect(rows('SELECT id,rep_id,original_rep_id FROM quotes ORDER BY id')).toEqual([
      {id:'q-1',rep_id:'brandi',original_rep_id:'brandi'},
      {id:'q-2',rep_id:'mara',original_rep_id:'mara'},
    ]);
    expect(rows("SELECT name,type,\"notnull\",dflt_value FROM pragma_table_info('quotes') WHERE name='original_rep_id'")).toEqual([{name:'original_rep_id',type:'TEXT',notnull:0,dflt_value:null}]);
  });

  it('references reps, so an unknown rep is refused',()=>{
    seedQuotes();
    toTarget();
    expect(rows("SELECT \"table\",\"from\",\"to\" FROM pragma_foreign_key_list('quotes') WHERE \"from\"='original_rep_id'")).toEqual([{table:'reps',from:'original_rep_id',to:'id'}]);
    expect(()=>exec("UPDATE quotes SET original_rep_id='nobody' WHERE id='q-1'")).toThrow(/FOREIGN KEY/);
    // Moving the current owner leaves the first owner alone.
    exec("UPDATE quotes SET rep_id='mara' WHERE id='q-1'");
    expect(rows("SELECT rep_id,original_rep_id FROM quotes WHERE id='q-1'")).toEqual([{rep_id:'mara',original_rep_id:'brandi'}]);
  });
});
