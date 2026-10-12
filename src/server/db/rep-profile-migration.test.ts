import Database from 'better-sqlite3';
import {copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {migrate,migrationsDir,readMigrations} from './migrate';

// 013_rep_profile (plan U9; new-ui-implementation-prompt Appendix C "rep profile" and "rep_notification_prefs"):
// the rep's picture on the rep record (name, phone and email are already there), and one in-app choice per rep
// per notification event. New columns and a new table only, so code that predates them ignores them.

const TARGET='013_rep_profile';
const BEFORE=readMigrations().filter(m=>m.id<TARGET).map(m=>`${m.id}.sql`);
let dir='';
let database:Database.Database;
beforeEach(()=>{
  dir=mkdtempSync(join(tmpdir(),'querent-013-'));
  for(const name of BEFORE)copyFileSync(join(migrationsDir(),name),join(dir,name));
  database=new Database(':memory:');
  database.pragma('foreign_keys = ON');
  migrate(database,{dir});
});
afterEach(()=>{database.close();rmSync(dir,{recursive:true,force:true});});

const exec=(sql:string,...params:unknown[])=>database.prepare(sql).run(...params);
function toTarget(){
  copyFileSync(join(migrationsDir(),`${TARGET}.sql`),join(dir,`${TARGET}.sql`));
  return migrate(database,{dir});
}
const addRep=(id:string)=>exec("INSERT INTO reps(id,name,initials,title,phone,email) VALUES(?,?,?,'Rep','(801) 555-0100','x@example.com')",id,`${id} Test`,id.slice(0,2).toUpperCase());
const KEYS=['quote_overdue','quote_aging','below_margin_floor','change_requested','quote_accepted','quote_declined','quote_expired','customer_chat_needs_rep'];

describe('migration 013_rep_profile',()=>{
  it('is the next migration after 012',()=>{
    expect(readMigrations().map(m=>m.id)).toContain(TARGET);
    expect(BEFORE.at(-1)).toBe('012_org_margin_floors.sql');
  });

  it('keeps every rep as it was, with no picture',()=>{
    addRep('mara');
    expect(toTarget()).toEqual([TARGET]);
    expect(database.prepare('SELECT id,name,phone,email,picture,picture_type,picture_updated_at FROM reps').all()).toEqual([
      {id:'mara',name:'mara Test',phone:'(801) 555-0100',email:'x@example.com',picture:null,picture_type:null,picture_updated_at:null},
    ]);
  });

  it('stores a PNG, JPEG or WebP picture only',()=>{
    addRep('mara');
    toTarget();
    for(const type of ['image/png','image/jpeg','image/webp'])exec("UPDATE reps SET picture=x'89',picture_type=?,picture_updated_at='2026-10-12T00:00:00.000Z' WHERE id='mara'",type);
    for(const type of ['image/svg+xml','image/gif','text/html'])expect(()=>exec("UPDATE reps SET picture_type=? WHERE id='mara'",type),type).toThrow(/CHECK/);
  });

  it('holds one in-app choice per rep per Appendix C event key, for a known rep only',()=>{
    addRep('mara');
    toTarget();
    for(const key of KEYS)exec("INSERT INTO rep_notification_prefs(rep_id,event_key,in_app) VALUES('mara',?,0)",key);
    expect(()=>exec("INSERT INTO rep_notification_prefs(rep_id,event_key,in_app) VALUES('mara','quote_aging',1)")).toThrow(/UNIQUE|PRIMARY KEY/);
    expect(()=>exec("INSERT INTO rep_notification_prefs(rep_id,event_key,in_app) VALUES('mara','quote_requested',1)")).toThrow(/CHECK/);
    expect(()=>exec("INSERT INTO rep_notification_prefs(rep_id,event_key,in_app) VALUES('nobody','quote_aging',1)")).toThrow(/FOREIGN KEY/);
    expect(()=>exec("UPDATE rep_notification_prefs SET in_app=2 WHERE rep_id='mara'")).toThrow(/CHECK/);
    expect(database.prepare("SELECT count(*) FROM rep_notification_prefs").pluck().get()).toBe(8);
  });
});
