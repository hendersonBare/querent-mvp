import Database from 'better-sqlite3';
import {copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {LINE_SOURCES} from '../../domain/quotes';
import {migrate,migrationsDir,readMigrations} from './migrate';

// The suggestion_lines rebuild (spec §1.2 "008" row, task E1): quote_lines and quote_removed_lines
// are rebuilt so added_by accepts 'suggestion'. Built at the migration before it, with rows that
// reference the rebuilt tables and the quote around them, then migrated: every row, value and
// column survives, foreign keys still resolve and cascade, and the CHECK takes 'suggestion' only.

const SLUG='_suggestion_lines';
let dir='';
let database:Database.Database;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'querent-e1-'));database=new Database(':memory:');database.pragma('foreign_keys = ON');});
afterEach(()=>{database.close();rmSync(dir,{recursive:true,force:true});});

const all=readMigrations();
const target=all.find(m=>m.id.endsWith(SLUG))!;
/** Copies the migrations before (or through) the rebuild into the test directory. */
const copy=(through:boolean)=>{for(const m of all){if(m===target&&!through)break;copyFileSync(join(migrationsDir(),`${m.id}.sql`),join(dir,`${m.id}.sql`));if(m===target)break;}};
const info=(table:string)=>database.prepare(`SELECT cid,name,type,"notnull",dflt_value,pk FROM pragma_table_info('${table}') ORDER BY cid`).all();
const indexes=(table:string)=>database.prepare(`SELECT name,"unique",origin FROM pragma_index_list('${table}') ORDER BY name`).all();
const foreignKeys=(table:string)=>database.prepare(`SELECT "table","from","to",on_delete FROM pragma_foreign_key_list('${table}') ORDER BY "from"`).all();
const rows=(table:string)=>database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
const count=(sql:string)=>database.prepare(sql).pluck().get();

function fixture(){
  database.exec(`
    INSERT INTO branches(id,code,name,address,city,state,zip,lat,lng,will_call_phone,will_call_hours) VALUES('slc','SLC','Salt Lake City','1 Main','Salt Lake City','UT','84101',40.7,-111.9,'-','7-5');
    INSERT INTO product_categories(id,name,sort_order) VALUES('fasteners','Fasteners',1);
    INSERT INTO items(id,sku,description,category_id,pack,case_qty,cost,list_price) VALUES('bolt','BOLT','Hex cap screw','fasteners','Box of 50',10,21.4,40),('nut','NUT','Hex nut','fasteners','Box of 100',10,8,15);
    INSERT INTO customers(id,account_number,name) VALUES('acme','A-1','Acme');
    INSERT INTO reps(id,name,initials,title,phone,email) VALUES('rep','Rep One','RO','Rep','-','-');
    INSERT INTO quotes(id,quote_number,customer_id,rep_id,status,requested_at,created_at,updated_at,fulfillment,branch_id) VALUES('q1','Q-1','acme','rep','sent','2026-09-01','2026-09-01','2026-09-01','will_call','slc');
    INSERT INTO quotes(id,quote_number,customer_id,rep_id,status,requested_at,created_at,updated_at,fulfillment,branch_id,duplicated_from) VALUES('q2','Q-2','acme','rep','ready_for_review','2026-09-02','2026-09-02','2026-09-02','will_call','slc','q1');
    INSERT INTO quote_lines(id,quote_id,line_no,item_id,qty,unit_price,price_basis,suggested_price,suggested_basis,customer_price,unit_cost,explanation,requested_text,match_score,added_by)
      VALUES('l1','q1',1,'bolt',10,36,'customer',36,'customer',38,21.4,'Customer price','10 boxes of bolts',0.97,'querent'),
            ('l2','q1',2,'nut',5,NULL,NULL,NULL,NULL,NULL,8,NULL,NULL,NULL,'upsell'),
            ('l3','q2',1,'bolt',3,40,'list',40,'list',NULL,21.4,NULL,NULL,NULL,'rep');
    INSERT INTO quote_removed_lines(quote_id,line_no,item_id,requested_text,match_score,added_by,removed_at) VALUES('q1',3,'nut',NULL,NULL,'rep','2026-09-01T10:00:00Z');
    INSERT INTO quote_revisions(id,quote_id,revision,sent_at,sent_by,total,snapshot) VALUES('r1','q1',1,'2026-09-01','rep',360,'{}');
    INSERT INTO quote_activity(quote_id,at,actor,kind,message) VALUES('q1','2026-09-01','rep','sent','Sent');
    INSERT INTO orders(id,order_number,customer_id,quote_id,order_date,status,fulfillment,branch_id,subtotal,freight,tax,total) VALUES('o1','SO-1','acme','q1','2026-09-03','open','will_call','slc',360,0,0,360);
  `);
}

describe(`migration ${target?.id??`NNN${SLUG}`}`,()=>{
  it('exists, after every migration whose columns it copies',()=>{
    expect(target).toBeDefined();
    expect(all.indexOf(target)).toBeGreaterThan(0);
  });

  it('keeps every row, value and column, the indexes and foreign keys, and the parents that reference the quote',()=>{
    copy(false);
    migrate(database,{dir});
    fixture();
    const before={lines:rows('quote_lines'),removed:rows('quote_removed_lines'),lineInfo:info('quote_lines'),removedInfo:info('quote_removed_lines'),
      lineIndexes:indexes('quote_lines'),removedIndexes:indexes('quote_removed_lines'),lineFks:foreignKeys('quote_lines'),removedFks:foreignKeys('quote_removed_lines')};
    // C1's per-unit recovery column is copied too, with its value.
    if(before.lineInfo.some(c=>(c as {name:string}).name==='freight_recovery'))database.exec("UPDATE quote_lines SET freight_recovery=32 WHERE id='l1'");
    const lines=rows('quote_lines');

    copy(true);
    expect(migrate(database,{dir})).toEqual([target.id]);
    expect(rows('quote_lines')).toEqual(lines);
    expect(rows('quote_removed_lines')).toEqual(before.removed);
    expect(info('quote_lines')).toEqual(before.lineInfo);
    expect(info('quote_removed_lines')).toEqual(before.removedInfo);
    expect(indexes('quote_lines')).toEqual(before.lineIndexes);
    expect(indexes('quote_removed_lines')).toEqual(before.removedIndexes);
    expect(foreignKeys('quote_lines')).toEqual(before.lineFks);
    expect(foreignKeys('quote_removed_lines')).toEqual(before.removedFks);
    expect(database.pragma('foreign_key_check')).toEqual([]);
    expect([count('SELECT count(*) FROM quote_revisions'),count('SELECT count(*) FROM quote_activity'),count("SELECT quote_id FROM orders WHERE id='o1'"),count("SELECT duplicated_from FROM quotes WHERE id='q2'")])
      .toEqual([1,1,'q1','q1']);
    expect(count("SELECT count(*) FROM sqlite_master WHERE name LIKE '%_new'")).toBe(0);

    // Foreign keys still resolve and cascade from the rebuilt tables.
    expect(()=>database.prepare("INSERT INTO quote_lines(id,quote_id,line_no,item_id,qty,unit_cost) VALUES('bad','no-quote',1,'bolt',1,1)").run()).toThrow(/FOREIGN KEY/);
    expect(()=>database.prepare("INSERT INTO quote_lines(id,quote_id,line_no,item_id,qty,unit_cost) VALUES('dup','q1',1,'bolt',1,1)").run()).toThrow(/UNIQUE/);
    database.prepare("DELETE FROM orders WHERE quote_id='q1'").run();
    database.prepare("UPDATE quotes SET duplicated_from=NULL WHERE id='q2'").run();
    database.prepare("DELETE FROM quotes WHERE id='q1'").run();
    expect([count("SELECT count(*) FROM quote_lines WHERE quote_id='q1'"),count("SELECT count(*) FROM quote_removed_lines WHERE quote_id='q1'")]).toEqual([0,0]);
  });

  it("lets added_by be 'suggestion' on both tables, defaults to 'querent', and still rejects anything else",()=>{
    copy(true);
    migrate(database,{dir});
    fixture();
    database.prepare("INSERT INTO quote_lines(id,quote_id,line_no,item_id,qty,unit_cost,added_by) VALUES('s1','q2',2,'nut',1,8,'suggestion')").run();
    database.prepare("INSERT INTO quote_lines(id,quote_id,line_no,item_id,qty,unit_cost) VALUES('s2','q2',3,'nut',1,8)").run();
    database.prepare("INSERT INTO quote_removed_lines(quote_id,line_no,item_id,added_by,removed_at) VALUES('q2',9,'nut','suggestion','2026-09-02')").run();
    expect(database.prepare("SELECT id,added_by FROM quote_lines WHERE id IN ('s1','s2') ORDER BY id").all()).toEqual([{id:'s1',added_by:'suggestion'},{id:'s2',added_by:'querent'}]);
    expect(()=>database.prepare("INSERT INTO quote_lines(id,quote_id,line_no,item_id,qty,unit_cost,added_by) VALUES('j','q2',4,'nut',1,8,'junk')").run()).toThrow(/CHECK/);
    expect(()=>database.prepare("INSERT INTO quote_removed_lines(quote_id,line_no,item_id,added_by,removed_at) VALUES('q2',10,'nut','junk','x')").run()).toThrow(/CHECK/);
    const check=(table:string)=>[...(database.prepare("SELECT sql FROM sqlite_master WHERE name=?").pluck().get(table) as string).matchAll(/CHECK\(added_by IN \(([^)]*)\)\)/g)].map(m=>m[1].split(',').map(v=>v.slice(1,-1)));
    expect(check('quote_lines')).toEqual([[...LINE_SOURCES]]);
    expect(check('quote_removed_lines')).toEqual([[...LINE_SOURCES]]);
  });
});
