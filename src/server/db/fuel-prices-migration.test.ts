import Database from 'better-sqlite3';
import {copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {migrate,migrationsDir,readMigrations} from './migrate';

// 008_fuel_prices (v3 spec §1.2 "fuel_prices" row, §4.3; decision 30; task C3): one stored fuel
// price per (state, fuel), with its as_of time, where it came from and the UTC day it was last fetched.

const TARGET='008_fuel_prices';
let dir='';
let database:Database.Database;
beforeEach(()=>{
  dir=mkdtempSync(join(tmpdir(),'querent-008-'));
  for(const m of readMigrations().filter(m=>m.id<=TARGET))copyFileSync(join(migrationsDir(),`${m.id}.sql`),join(dir,`${m.id}.sql`));
  database=new Database(':memory:');
  database.pragma('foreign_keys = ON');
  migrate(database,{dir});
});
afterEach(()=>{database.close();rmSync(dir,{recursive:true,force:true});});

const insert=(row:Record<string,unknown>)=>database.prepare('INSERT INTO fuel_prices(state,fuel,price_cents,as_of,source,fetched_on) VALUES(@state,@fuel,@price_cents,@as_of,@source,@fetched_on)').run(row);
const ROW={state:'UT',fuel:'gasoline',price_cents:340,as_of:'2026-09-23T00:00:00.000Z',source:'seed',fetched_on:'2026-09-23'};

describe('migration 008_fuel_prices',()=>{
  it('is applied in order after 007',()=>{
    expect(readMigrations().map(m=>m.id)).toContain(TARGET);
    expect(database.prepare('SELECT id FROM schema_migrations ORDER BY id').all().map(r=>(r as {id:string}).id).at(-1)).toBe(TARGET);
  });

  it('stores one price per state and fuel',()=>{
    insert(ROW);
    insert({...ROW,fuel:'diesel',price_cents:389,source:'api'});
    expect(()=>insert({...ROW,price_cents:350})).toThrow(/UNIQUE|PRIMARY KEY/);
  });

  it('refuses another fuel, another source, a negative price and missing times',()=>{
    expect(()=>insert({...ROW,fuel:'kerosene'})).toThrow(/CHECK/);
    expect(()=>insert({...ROW,source:'manual'})).toThrow(/CHECK/);
    expect(()=>insert({...ROW,price_cents:-1})).toThrow(/CHECK/);
    expect(()=>insert({...ROW,as_of:null})).toThrow(/NOT NULL/);
    expect(()=>insert({...ROW,fetched_on:null})).toThrow(/NOT NULL/);
  });
});
