import Database from 'better-sqlite3';
import {copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {migrate,migrationsDir,readMigrations} from './migrate';

// 011_teams (plan U7; new-ui-implementation-prompt Appendix C "teams"; decision 47): teams become
// entities with a name and an optional parent team, and each rep belongs to at most one team
// (team_members). The free-text team label on reps (006_roles) is migrated into rows: one team per
// label (trimmed, case-insensitive), each rep a member of their label's team. A parent is grouping only.

const TARGET='011_teams';
const BEFORE=readMigrations().filter(m=>m.id<TARGET).map(m=>`${m.id}.sql`);
let dir='';
let database:Database.Database;
beforeEach(()=>{
  dir=mkdtempSync(join(tmpdir(),'querent-011-'));
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
function addRep(id:string,team:string|null,role='rep'){
  exec("INSERT INTO reps(id,name,initials,title,phone,email,role,team) VALUES(?,?,?,'Rep','','',?,?)",id,`${id} Test`,id.slice(0,2).toUpperCase(),role,team);
}

describe('migration 011_teams',()=>{
  it('is the next migration after 010',()=>{
    expect(readMigrations().map(m=>m.id)).toContain(TARGET);
    expect(BEFORE.at(-1)).toBe('010_customer_notification_reads.sql');
  });

  it('turns each team label into one team (trimmed, case-insensitive) and makes each rep a member of it',()=>{
    addRep('brandi','Inside Sales','manager');
    addRep('mara','Inside Sales');
    addRep('eli',' Outside Sales ');
    addRep('nora','outside sales');
    addRep('ted',null);
    addRep('blank','   ');
    expect(toTarget()).toEqual([TARGET]);
    expect(rows('SELECT name,parent_team_id FROM teams ORDER BY name')).toEqual([
      {name:'Inside Sales',parent_team_id:null},{name:'Outside Sales',parent_team_id:null},
    ]);
    expect(rows('SELECT m.rep_id,t.name FROM team_members m JOIN teams t ON t.id=m.team_id ORDER BY m.rep_id')).toEqual([
      {rep_id:'brandi',name:'Inside Sales'},{rep_id:'eli',name:'Outside Sales'},{rep_id:'mara',name:'Inside Sales'},{rep_id:'nora',name:'Outside Sales'},
    ]);
  });

  it('keeps one team per rep, unique names whatever their case, and no team inside itself',()=>{
    addRep('mara','Inside Sales');
    toTarget();
    const inside=database.prepare("SELECT id FROM teams WHERE name='Inside Sales'").pluck().get();
    expect(()=>exec("INSERT INTO teams(name) VALUES('inside sales')")).toThrow(/UNIQUE/);
    expect(()=>exec("INSERT INTO teams(name) VALUES('  ')")).toThrow(/CHECK/);
    expect(()=>exec('INSERT INTO teams(name) VALUES(NULL)')).toThrow(/NOT NULL/);
    exec("INSERT INTO teams(name,parent_team_id) VALUES('Counter',?)",inside);
    const counter=database.prepare("SELECT id FROM teams WHERE name='Counter'").pluck().get();
    expect(()=>exec('UPDATE teams SET parent_team_id=id WHERE id=?',counter)).toThrow(/CHECK/);
    expect(()=>exec('INSERT INTO team_members(rep_id,team_id) VALUES(?,?)','mara',counter)).toThrow(/UNIQUE|PRIMARY KEY/);
    expect(()=>exec('INSERT INTO team_members(rep_id,team_id) VALUES(?,?)','nobody',counter)).toThrow(/FOREIGN KEY/);
    expect(()=>exec('UPDATE teams SET parent_team_id=999 WHERE id=?',counter)).toThrow(/FOREIGN KEY/);
  });

  it('a team removed takes its members with it, and its child teams stand on their own',()=>{
    addRep('mara','Inside Sales');
    toTarget();
    const inside=database.prepare("SELECT id FROM teams WHERE name='Inside Sales'").pluck().get();
    exec("INSERT INTO teams(name,parent_team_id) VALUES('Counter',?)",inside);
    exec('DELETE FROM teams WHERE id=?',inside);
    expect(rows('SELECT name,parent_team_id FROM teams')).toEqual([{name:'Counter',parent_team_id:null}]);
    expect(rows('SELECT * FROM team_members')).toEqual([]);
  });
});
