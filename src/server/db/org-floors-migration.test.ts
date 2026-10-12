import Database from 'better-sqlite3';
import {copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {migrate,migrationsDir,readMigrations} from './migrate';

// 012_org_margin_floors (plan U8; new-ui-implementation-prompt Appendix C "org_margin_floors"): one
// organization margin floor per product category, the hard stop reps cannot go below. A new table only,
// so code that predates it ignores it. An existing database starts each category at the lowest floor any
// rep has in it, so no rep's margin starts under the organization floor.

const TARGET='012_org_margin_floors';
const BEFORE=readMigrations().filter(m=>m.id<TARGET).map(m=>`${m.id}.sql`);
let dir='';
let database:Database.Database;
beforeEach(()=>{
  dir=mkdtempSync(join(tmpdir(),'querent-012-'));
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
function addCategory(id:string,order:number){exec("INSERT INTO product_categories(id,name,sort_order) VALUES(?,?,?)",id,`${id} name`,order);}
function addRep(id:string){exec("INSERT INTO reps(id,name,initials,title,phone,email) VALUES(?,?,?,'Rep','','')",id,`${id} Test`,id.slice(0,2).toUpperCase());}
function addFloor(rep:string,category:string,floor:number){exec("INSERT INTO rep_category_floors(rep_id,category_id,margin_floor,updated_at) VALUES(?,?,?,'2026-09-23T00:00:00.000Z')",rep,category,floor);}

describe('migration 012_org_margin_floors',()=>{
  it('is the next migration after 011',()=>{
    expect(readMigrations().map(m=>m.id)).toContain(TARGET);
    expect(BEFORE.at(-1)).toBe('011_teams.sql');
  });

  it('starts each category at the lowest floor any rep has in it; a category no rep has gets none',()=>{
    addCategory('fasteners',1);addCategory('safety',2);addCategory('tools',3);
    addRep('brandi');addRep('mara');
    addFloor('brandi','fasteners',0.2);addFloor('mara','fasteners',0.22);
    addFloor('brandi','safety',0.3);addFloor('mara','safety',0.2);
    expect(toTarget()).toEqual([TARGET]);
    expect(rows('SELECT category_id,floor FROM org_margin_floors ORDER BY category_id')).toEqual([
      {category_id:'fasteners',floor:0.2},{category_id:'safety',floor:0.2},
    ]);
  });

  it('holds one floor per known category, at least 0 and under 1',()=>{
    addCategory('fasteners',1);
    toTarget();
    exec("INSERT INTO org_margin_floors(category_id,floor) VALUES('fasteners',0.25)");
    expect(()=>exec("INSERT INTO org_margin_floors(category_id,floor) VALUES('fasteners',0.3)")).toThrow(/UNIQUE|PRIMARY KEY/);
    expect(()=>exec("INSERT INTO org_margin_floors(category_id,floor) VALUES('nothing',0.3)")).toThrow(/FOREIGN KEY/);
    exec("DELETE FROM org_margin_floors");
    expect(()=>exec("INSERT INTO org_margin_floors(category_id,floor) VALUES('fasteners',1)")).toThrow(/CHECK/);
    expect(()=>exec("INSERT INTO org_margin_floors(category_id,floor) VALUES('fasteners',-0.01)")).toThrow(/CHECK/);
    expect(()=>exec("INSERT INTO org_margin_floors(category_id,floor) VALUES('fasteners',NULL)")).toThrow(/NOT NULL/);
  });
});
