import Database from 'better-sqlite3';
import {copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {migrate,migrationsDir,readMigrations} from './migrate';

// 006_roles (v3 spec §1.2 "006" row, §8; decisions 20, 21; task D1): reps gain a role (rep or
// manager), a free-text team label and an active flag. Added columns only; Brandi becomes the manager.

const TARGET='006_roles';
const BEFORE=readMigrations().filter(m=>m.id<TARGET).map(m=>`${m.id}.sql`);
let dir='';
let database:Database.Database;
beforeEach(()=>{
  dir=mkdtempSync(join(tmpdir(),'querent-006-'));
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

describe('migration 006_roles',()=>{
  it('adds role, team and active to existing reps, and makes Brandi the manager',()=>{
    exec(`INSERT INTO reps(id,name,initials,title,phone,email) VALUES('brandi','Brandi Test','BT','Rep','',''),('mara','Mara Test','MT','Rep','','')`);
    expect(toTarget()).toEqual([TARGET]);
    expect(rows('SELECT id,role,team,active FROM reps ORDER BY id')).toEqual([
      {id:'brandi',role:'manager',team:null,active:1},
      {id:'mara',role:'rep',team:null,active:1},
    ]);
    expect(rows("SELECT name,type,\"notnull\",dflt_value FROM pragma_table_info('reps') WHERE name IN ('role','team','active') ORDER BY name")).toEqual([
      {name:'active',type:'INTEGER',notnull:1,dflt_value:'1'},
      {name:'role',type:'TEXT',notnull:1,dflt_value:"'rep'"},
      {name:'team',type:'TEXT',notnull:0,dflt_value:null},
    ]);
  });

  it('refuses an unknown role and an active flag other than 0 or 1',()=>{
    toTarget();
    exec(`INSERT INTO reps(id,name,initials,title,phone,email) VALUES('eli','Eli Test','ET','Rep','','')`);
    expect(()=>exec("UPDATE reps SET role='admin' WHERE id='eli'")).toThrow(/CHECK/);
    expect(()=>exec("UPDATE reps SET active=2 WHERE id='eli'")).toThrow(/CHECK/);
    expect(()=>exec("UPDATE reps SET role=NULL WHERE id='eli'")).toThrow(/NOT NULL/);
    exec("UPDATE reps SET role='manager',active=0,team='Outside Sales' WHERE id='eli'");
    expect(rows("SELECT role,team,active FROM reps WHERE id='eli'")).toEqual([{role:'manager',team:'Outside Sales',active:0}]);
  });
});
