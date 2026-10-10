import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {closeDatabase,db,reseedDatabase,seedAnchor} from './index';
import {readMigrations} from './migrate';
import {seedDatabase} from './seed';
import {createV4Database} from './test-v4';

let root='';
beforeEach(()=>{root=mkdtempSync(join(tmpdir(),'querent-db-'));process.env.DATABASE_PATH=join(root,'test.sqlite');process.env.QUERENT_SEED_DATE='2026-09-23';});
afterEach(()=>{closeDatabase();rmSync(root,{recursive:true,force:true});delete process.env.DATABASE_PATH;delete process.env.QUERENT_SEED_DATE;});
const status=()=>db().prepare("SELECT status FROM quotes WHERE id='q-24817'").pluck().get();
const applied=()=>db().prepare('SELECT id FROM schema_migrations ORDER BY id').pluck().all();
const allIds=()=>readMigrations().map(m=>m.id);

it('creates a new database through every migration, then seeds it',()=>{
  expect(applied()).toEqual(allIds());
  expect(seedAnchor()).toBe('2026-09-23');
  expect(status()).toBe('ready_for_review');
  expect(db().pragma('foreign_keys',{simple:true})).toBe(1);
});

it('keeps existing data when the database is reopened',()=>{
  db().prepare("UPDATE quotes SET status='sent' WHERE id='q-24817'").run();
  const quotes=db().prepare('SELECT count(*) FROM quotes').pluck().get();
  closeDatabase();
  expect(status()).toBe('sent');
  expect(db().prepare('SELECT count(*) FROM quotes').pluck().get()).toBe(quotes);
});

it('adopts an existing v4 database on open and keeps its data (spec §1.1)',()=>{
  const old=new Database(process.env.DATABASE_PATH!);
  createV4Database(old);
  seedDatabase(old,{anchor:'2026-09-23'});
  old.prepare("UPDATE quotes SET status='sent' WHERE id='q-24817'").run();
  const quotes=old.prepare('SELECT count(*) FROM quotes').pluck().get();
  old.close();
  expect(applied()).toEqual(allIds());
  expect(status()).toBe('sent');
  expect(db().prepare('SELECT count(*) FROM quotes').pluck().get()).toBe(quotes);
  // 006_roles ran on the adopted data: Brandi is the manager, everyone else a rep (task D1).
  expect(db().prepare("SELECT id FROM reps WHERE role='manager'").pluck().all()).toEqual(['brandi']);
});

it('refuses a database from an older schema and says to run db:reset',()=>{
  const old=new Database(process.env.DATABASE_PATH!);
  old.exec("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);INSERT INTO meta VALUES('schema_version','2');CREATE TABLE customers(id TEXT PRIMARY KEY,name TEXT NOT NULL);");
  old.close();
  expect(()=>db()).toThrow(/schema 2 .*incompatible with schema 4\. Run npm run db:reset/);
  // A failed open must not leave a half-initialised connection behind.
  expect(()=>db()).toThrow(/npm run db:reset/);
});

it('refuses a database that has tables but no schema version',()=>{
  const old=new Database(process.env.DATABASE_PATH!);old.exec('CREATE TABLE parts_stock(id TEXT PRIMARY KEY);');old.close();
  expect(()=>db()).toThrow(/unversioned.*npm run db:reset/);
});

it('reseeds in place, so a second connection to the same file sees the fresh seed',()=>{
  db().prepare("UPDATE quotes SET status='sent' WHERE id='q-24817'").run();
  db().prepare("INSERT INTO conversations(id,customer_id,started_at) VALUES('conv-e2e','wasatch','2026-09-24T09:00:00.000Z')").run();
  const other=new Database(process.env.DATABASE_PATH!);
  try{
    expect(other.prepare("SELECT status FROM quotes WHERE id='q-24817'").pluck().get()).toBe('sent');
    expect(reseedDatabase({anchor:'2026-10-01'})).toBe('2026-10-01');
    expect(status()).toBe('ready_for_review');
    expect(seedAnchor()).toBe('2026-10-01');
    expect(db().prepare("SELECT count(*) FROM conversations WHERE id='conv-e2e'").pluck().get()).toBe(0);
    expect(applied()).toEqual(allIds());
    expect(db().pragma('foreign_keys',{simple:true})).toBe(1);
    expect(other.prepare("SELECT status FROM quotes WHERE id='q-24817'").pluck().get()).toBe('ready_for_review');
    expect(other.prepare("SELECT requested_at FROM quotes WHERE id='q-24817'").pluck().get()).toMatch(/^2026-10-01T/);
  }finally{other.close();}
});

it('reseeds with QUERENT_SEED_DATE when no anchor is given',()=>{
  expect(reseedDatabase()).toBe('2026-09-23');
  expect(seedAnchor()).toBe('2026-09-23');
});
