import Database from 'better-sqlite3';
import {copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {migrate,migrationsDir} from './migrate';

// 002_declined (decision 8, v3 spec §1.2): SQLite can't alter a CHECK, so the migration rebuilds
// `quotes` with `declined` in its status CHECK and the three decline columns. The rebuild must keep
// every row and every pre-migration column with its value, and every row that references a quote
// (quote_lines, quote_removed_lines, quote_revisions, quote_activity, quote_notes, orders.quote_id,
// quotes.duplicated_from) must still resolve to it.

let dir='';
let database:Database.Database;
beforeEach(()=>{
  dir=mkdtempSync(join(tmpdir(),'querent-002-'));
  copyFileSync(join(migrationsDir(),'001_baseline.sql'),join(dir,'001_baseline.sql'));
  database=new Database(':memory:');
  database.pragma('foreign_keys = ON');
  migrate(database,{dir});
});
afterEach(()=>{database.close();rmSync(dir,{recursive:true,force:true});});

const exec=(sql:string,...params:unknown[])=>database.prepare(sql).run(...params);
const rows=(sql:string)=>database.prepare(sql).all() as Record<string,unknown>[];
const count=(table:string)=>database.prepare(`SELECT count(*) FROM ${table}`).pluck().get() as number;
const columns=()=>database.prepare("SELECT name FROM pragma_table_info('quotes')").pluck().all() as string[];
const CHILDREN=['quote_lines','quote_removed_lines','quote_revisions','quote_activity','quote_notes','orders'];

/** A database at 001 with two quotes (the second duplicated from the first) and a row in every table that references quotes. */
function seed001(){
  exec(`INSERT INTO branches(id,code,name,address,city,state,zip,lat,lng,will_call_phone,will_call_hours) VALUES('slc','SLC','Salt Lake','1 Test Way','Salt Lake City','UT','84101',40.7,-111.9,'','7-4')`);
  exec(`INSERT INTO product_categories(id,name,sort_order) VALUES('fasteners','Fasteners',1)`);
  exec(`INSERT INTO items(id,sku,description,category_id,pack,case_qty,cost,list_price) VALUES('bolt','B-1','Bolt','fasteners','box',10,12.5,20)`);
  exec(`INSERT INTO customers(id,account_number,name) VALUES('wasatch','W-1','Wasatch')`);
  exec(`INSERT INTO contacts(id,customer_id,name) VALUES('dana','wasatch','Dana Test')`);
  exec(`INSERT INTO reps(id,name,initials,title,phone,email) VALUES('brandi','Brandi Test','BT','Rep','','')`);
  exec(`INSERT INTO conversations(id,customer_id,contact_id,started_at) VALUES('c-1','wasatch','dana','2026-09-01T00:00:00.000Z')`);
  // Every column of 001's quotes filled, so "each value survives" covers them all.
  exec(`INSERT INTO quotes(id,quote_number,customer_id,contact_id,rep_id,status,revision,conversation_id,request_text,requested_at,created_at,updated_at,sent_at,responded_at,
      fulfillment,branch_id,requested_date,fulfillment_time,ship_to_address,ship_to_lat,ship_to_lng,freight_override,freight_override_reason,valid_days,valid_until,expires_on,
      customer_po,customer_note,change_request_note,unread_for_rep,unread_for_customer,is_sample,duplicated_from)
    VALUES('q-1','Q-1','wasatch','dana','brandi','accepted',2,'c-1','10 bolts','2026-09-01T00:00:00.000Z','2026-09-01T00:00:01.000Z','2026-09-03T00:00:00.000Z','2026-09-02T00:00:00.000Z',
      '2026-09-03T00:00:00.000Z','delivery','slc','2026-09-10','2026-09-10T16:00:00.000Z','1 Job Site',40.71,-111.91,35.5,'Long haul',30,'2026-10-02','2026-10-02','PO-1','Thanks','More bolts',1,0,1,NULL)`);
  exec(`INSERT INTO quotes(id,quote_number,customer_id,rep_id,status,requested_at,created_at,updated_at,fulfillment,branch_id,duplicated_from)
    VALUES('q-2','Q-2','wasatch','brandi','ready_for_review','2026-09-04T00:00:00.000Z','2026-09-04T00:00:00.000Z','2026-09-04T00:00:00.000Z','will_call','slc','q-1')`);
  for(const q of ['q-1','q-2'])exec(`INSERT INTO quote_lines(id,quote_id,line_no,item_id,qty,unit_price,unit_cost) VALUES(?,?,1,'bolt',10,19.5,12.5)`,`${q}-1`,q);
  exec(`INSERT INTO quote_removed_lines(quote_id,line_no,item_id,added_by,removed_at) VALUES('q-2',2,'bolt','rep','2026-09-04T00:00:00.000Z')`);
  exec(`INSERT INTO quote_revisions(id,quote_id,revision,sent_at,sent_by,total,snapshot) VALUES('q-1-r1','q-1',1,'2026-09-02T00:00:00.000Z','brandi',195,'{}')`);
  exec(`INSERT INTO quote_activity(quote_id,at,actor,kind,message) VALUES('q-1','2026-09-02T00:00:00.000Z','rep','sent','sent'),('q-2','2026-09-04T00:00:00.000Z','rep','duplicated','dup')`);
  exec(`INSERT INTO quote_notes(quote_id,rep_id,body,created_at) VALUES('q-1','brandi','note','2026-09-02T00:00:00.000Z')`);
  exec(`INSERT INTO orders(id,order_number,customer_id,quote_id,order_date,status,fulfillment,branch_id,subtotal,freight,tax,total) VALUES('o-1','SO-1','wasatch','q-1','2026-09-05','open','delivery','slc',195,35.5,0,230.5)`);
}

function migrateTo002(){
  copyFileSync(join(migrationsDir(),'002_declined.sql'),join(dir,'002_declined.sql'));
  return migrate(database,{dir});
}

describe('002_declined',()=>{
  it('keeps every quote, every pre-migration column and its value, and adds the three decline columns (null)',()=>{
    seed001();
    const before=columns(),quotesBefore=rows('SELECT * FROM quotes ORDER BY id');
    const counts=Object.fromEntries(CHILDREN.map(t=>[t,count(t)]));
    expect(migrateTo002()).toEqual(['002_declined']);
    expect(columns()).toEqual([...before,'declined_at','decline_reason','decline_note']);
    const after=rows('SELECT * FROM quotes ORDER BY id');
    expect(after).toEqual(quotesBefore.map(q=>({...q,declined_at:null,decline_reason:null,decline_note:null})));
    expect(Object.fromEntries(CHILDREN.map(t=>[t,count(t)]))).toEqual(counts);
  });

  it('leaves every reference to quotes resolving: foreign_key_check is clean, and cascades still reach the rebuilt table',()=>{
    seed001();
    migrateTo002();
    expect(database.pragma('foreign_key_check')).toEqual([]);
    expect(database.pragma('foreign_keys',{simple:true})).toBe(1);
    for(const table of ['quote_lines','quote_removed_lines','quote_revisions','quote_activity','quote_notes','orders','quotes'])
      expect((database.pragma(`foreign_key_list(${table})`) as {table:string}[]).map(fk=>fk.table),table).toContain('quotes');
    // A dangling reference to the rebuilt table is still refused...
    expect(()=>exec(`INSERT INTO quote_notes(quote_id,rep_id,body,created_at) VALUES('q-nope','brandi','x','2026-09-05')`)).toThrow(/FOREIGN KEY/);
    expect(()=>exec(`UPDATE quotes SET duplicated_from='q-nope' WHERE id='q-2'`)).toThrow(/FOREIGN KEY/);
    // ...and deleting a quote still cascades to its lines and activity.
    exec(`DELETE FROM quotes WHERE id='q-2'`);
    expect(database.prepare(`SELECT count(*) FROM quote_lines WHERE quote_id='q-2'`).pluck().get()).toBe(0);
    expect(database.prepare(`SELECT count(*) FROM quote_activity WHERE quote_id='q-2'`).pluck().get()).toBe(0);
  });

  it('recreates the quotes indexes and leaves no quotes_new behind',()=>{
    migrateTo002();
    expect(database.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='quotes_customer'").pluck().get()).toBe('CREATE INDEX quotes_customer ON quotes(customer_id,requested_at)');
    expect(database.prepare("SELECT count(*) FROM sqlite_master WHERE name LIKE 'quotes_new%'").pluck().get()).toBe(0);
  });

  it('accepts declined with a reason and a note of up to 250 characters, and refuses an unknown status, reason or a longer note',()=>{
    seed001();
    migrateTo002();
    exec(`UPDATE quotes SET status='declined',declined_at='2026-09-05T00:00:00.000Z',decline_reason='price_too_high' WHERE id='q-2'`);
    for(const reason of ['price_too_high','found_other_source','need_sooner','wrong_items','other',null])exec('UPDATE quotes SET decline_reason=? WHERE id=?',reason,'q-2');
    exec(`UPDATE quotes SET decline_reason='other',decline_note=? WHERE id='q-2'`,'x'.repeat(250));
    expect(()=>exec(`UPDATE quotes SET decline_note=? WHERE id='q-2'`,'x'.repeat(251))).toThrow(/CHECK/);
    expect(()=>exec(`UPDATE quotes SET decline_reason='no_response' WHERE id='q-2'`)).toThrow(/CHECK/);
    expect(()=>exec(`UPDATE quotes SET status='lost' WHERE id='q-2'`)).toThrow(/CHECK/);
    expect(rows(`SELECT status,decline_reason,length(decline_note) n FROM quotes WHERE id='q-2'`)).toEqual([{status:'declined',decline_reason:'other',n:250}]);
  });
});
