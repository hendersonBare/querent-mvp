import Database from 'better-sqlite3';
import {copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {migrate,migrationsDir,readMigrations} from './migrate';

// 010_customer_notification_reads (plan U10; new-ui-implementation-prompt Appendix C
// "customer_notifications ... Or derive from quote_activity and order status with a per-customer read
// marker"): the bell's notifications are derived on read, and this table only remembers which ones
// each customer has read.

const TARGET='010_customer_notification_reads';
let dir='';
let database:Database.Database;
beforeEach(()=>{
  dir=mkdtempSync(join(tmpdir(),'querent-010-'));
  for(const m of readMigrations().filter(m=>m.id<=TARGET))copyFileSync(join(migrationsDir(),`${m.id}.sql`),join(dir,`${m.id}.sql`));
  database=new Database(':memory:');
  database.pragma('foreign_keys = ON');
  migrate(database,{dir});
  database.prepare("INSERT INTO price_levels(id,code,name) VALUES('pl','PL','Level')").run();
  database.prepare("INSERT INTO customers(id,account_number,name) VALUES('wasatch','WAS-1142','Wasatch Mechanical Contractors')").run();
});
afterEach(()=>{database.close();rmSync(dir,{recursive:true,force:true});});

const insert=(row:Record<string,unknown>)=>database.prepare('INSERT INTO customer_notification_reads(customer_id,notification_id,read_at) VALUES(@customer_id,@notification_id,@read_at)').run(row);
const ROW={customer_id:'wasatch',notification_id:'quote:q-24791:rev:1',read_at:'2026-09-23T18:00:00.000Z'};

describe('migration 010_customer_notification_reads',()=>{
  it('is applied in order after 009',()=>{
    expect(readMigrations().map(m=>m.id)).toContain(TARGET);
    expect(database.prepare('SELECT id FROM schema_migrations ORDER BY id').pluck().all().at(-1)).toBe(TARGET);
  });

  it('keeps one row per customer and notification',()=>{
    insert(ROW);
    insert({...ROW,notification_id:'order:o-51223:shipped'});
    expect(()=>insert({...ROW,read_at:'2026-09-24T18:00:00.000Z'})).toThrow(/UNIQUE|PRIMARY KEY/);
    expect(database.prepare('SELECT count(*) FROM customer_notification_reads').pluck().get()).toBe(2);
  });

  it('belongs to a real customer, and refuses missing values',()=>{
    expect(()=>insert({...ROW,customer_id:'nobody'})).toThrow(/FOREIGN KEY/);
    expect(()=>insert({...ROW,notification_id:null})).toThrow(/NOT NULL/);
    expect(()=>insert({...ROW,read_at:null})).toThrow(/NOT NULL/);
  });
});
