import Database from 'better-sqlite3';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {migrate} from './migrate';
import {ERP_SOURCED_TABLES} from './schema';
import {seedDatabase,seedSampleQuote} from './seed';
import {addDays} from './seed/dates';

// Seed invariants (task 0.2). Every date in the seed is an offset from the anchor
// (the day Dana sent the Q-24817 request), so run the checks at the mockup's date
// and at a later one to prove nothing depends on the calendar.
const MOCKUP_ANCHOR='2026-09-23';
const MOCKUP_SKUS=['HCS-12-13-2G8','HN-12-13-G8','FW-12-G8','CW-45-045-T1','CW-45-045-T27','FD-45-60Z','GLV-N8-L-1000','SG-CLR-AF','RS-2-27-JH','RS-2-30-FH','EDG-2-4PK','DT-2-60'];
const CATEGORY_NAMES=['Fasteners','Abrasives & Cutting','Safety & PPE','Material Handling & Tie-downs','Tools','Janitorial/MRO'];
const INFO_CATEGORIES=['items_stock','pricing','orders_quotes','account'];

function open(anchor:string){const d=new Database(':memory:');d.pragma('foreign_keys = ON');migrate(d);seedDatabase(d,{anchor});return d;}
function milesBetween(a:{lat:number;lng:number},b:{lat:number;lng:number}){const r=(x:number)=>x*Math.PI/180;const h=Math.sin(r(b.lat-a.lat)/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(r(b.lng-a.lng)/2)**2;return 2*3958.8*Math.asin(Math.sqrt(h));}

describe.each([MOCKUP_ANCHOR,'2027-03-01'])('seed anchored at %s',anchor=>{
  let d:Database.Database;
  beforeAll(()=>{d=open(anchor);});
  afterAll(()=>d.close());
  const get=<T=Record<string,unknown>>(sql:string,...p:unknown[])=>d.prepare(sql).get(...p) as T;
  const all=<T=Record<string,unknown>>(sql:string,...p:unknown[])=>d.prepare(sql).all(...p) as T[];
  const value=<T=unknown>(sql:string,...p:unknown[])=>d.prepare(sql).pluck().get(...p) as T;
  const column=<T=unknown>(sql:string,...p:unknown[])=>d.prepare(sql).pluck().all(...p) as T[];
  const itemId=(sku:string)=>value<string>('SELECT id FROM items WHERE sku=?',sku);

  it('has Herrick as the one supplier, with scarcity uplift off',()=>{
    expect(column('SELECT name FROM suppliers')).toEqual(['Herrick Industrial Supply']);
    expect(value("SELECT value FROM settings WHERE key='scarcity_uplift_enabled'")).toBe('false');
  });

  it('has the SLC, Ogden and Provo branches with coordinates and will-call phones',()=>{
    const branches=all<{code:string;lat:number;lng:number;will_call_phone:string;address:string}>('SELECT * FROM branches ORDER BY code');
    expect(branches.map(b=>b.code)).toEqual(['Ogden','Provo','SLC']);
    for(const b of branches){
      expect(b.lat).toBeGreaterThan(40);expect(b.lat).toBeLessThan(41.5);
      expect(b.lng).toBeGreaterThan(-112.2);expect(b.lng).toBeLessThan(-111.5);
      expect(b.will_call_phone).toMatch(/^\(801\) 555-01\d\d$/);
      expect(b.address).not.toBe('');
    }
    expect(new Set(branches.map(b=>b.will_call_phone)).size).toBe(3);
  });

  it('has the six product categories in order',()=>{
    expect(column('SELECT name FROM product_categories ORDER BY sort_order')).toEqual(CATEGORY_NAMES);
  });

  it('has about 60 SKUs, each with cost, list, case qty and a category',()=>{
    const items=all<{sku:string;cost:number;list_price:number;case_qty:number;category_id:string;pack:string}>('SELECT * FROM items');
    expect(items.length).toBeGreaterThanOrEqual(55);expect(items.length).toBeLessThanOrEqual(65);
    for(const i of items){
      expect(i.cost,i.sku).toBeGreaterThan(0);
      expect(i.list_price,i.sku).toBeGreaterThan(i.cost);
      expect(Number.isInteger(i.case_qty)&&i.case_qty>=1,i.sku).toBe(true);
      expect(i.pack,i.sku).not.toBe('');
    }
    for(const name of CATEGORY_NAMES)expect(value<number>('SELECT count(*) FROM items i JOIN product_categories c ON c.id=i.category_id WHERE c.name=?',name),name).toBeGreaterThanOrEqual(5);
  });

  it('includes every mockup item, with the mockup cost and list on the Q-24817 lines',()=>{
    const skus=new Set(column<string>('SELECT sku FROM items'));
    for(const sku of MOCKUP_SKUS)expect(skus.has(sku),sku).toBe(true);
    const priced=(sku:string)=>get<{cost:number;list_price:number}>('SELECT cost,list_price FROM items WHERE sku=?',sku);
    expect(priced('HCS-12-13-2G8')).toEqual({cost:21.4,list_price:38.95});
    expect(priced('CW-45-045-T1')).toEqual({cost:24.1,list_price:46});
    expect(priced('GLV-N8-L-1000')).toEqual({cost:58,list_price:94});
    expect(priced('RS-2-27-JH')).toEqual({cost:14.2,list_price:28.5});
  });

  it('includes near-duplicates that need clarifying (Grade 5 vs 8, 1-1/2 vs 2 in, Type 1 vs 27)',()=>{
    const descriptions=column<string>('SELECT description FROM items');
    const has=(re:RegExp)=>descriptions.some(x=>re.test(x));
    expect(has(/Hex cap screw 1\/2-13 x 2 in, Grade 8/)).toBe(true);
    expect(has(/Hex cap screw 1\/2-13 x 2 in, Grade 5/)).toBe(true);
    expect(has(/Hex cap screw 1\/2-13 x 1-1\/2 in, Grade 8/)).toBe(true);
    expect(has(/Ratchet strap 1-1\/2 in/)).toBe(true);
    expect(has(/Ratchet strap 2 in x 27 ft/)).toBe(true);
    expect(has(/Ratchet strap 2 in x 30 ft/)).toBe(true);
    expect(has(/Cut-off wheel 4\.5 x \.045 x 7\/8 in, Type 1$/)).toBe(true);
    expect(has(/Cut-off wheel 4\.5 x \.045 x 7\/8 in, Type 27$/)).toBe(true);
  });

  it('stocks every SKU at every branch',()=>{
    expect(value('SELECT count(*) FROM branch_stock')).toBe(value<number>('SELECT count(*) FROM items')*3);
    expect(value('SELECT count(*) FROM branch_stock WHERE available<0')).toBe(0);
  });

  it('has the 2 in x 27 ft straps short at SLC and stocked at Ogden, with a PO due at SLC',()=>{
    const stock=(code:string)=>get<{available:number;on_order:number;next_receipt_on:string|null}>('SELECT s.* FROM branch_stock s JOIN branches b ON b.id=s.branch_id WHERE s.item_id=? AND b.code=?',itemId('RS-2-27-JH'),code);
    const qty=value<number>("SELECT l.qty FROM quote_lines l JOIN items i ON i.id=l.item_id WHERE l.quote_id='q-24817' AND i.sku='RS-2-27-JH'");
    expect(stock('SLC').available).toBeLessThan(qty);
    expect(stock('Ogden').available).toBeGreaterThanOrEqual(qty);
    expect(stock('SLC').on_order).toBeGreaterThan(0);
    expect(stock('SLC').next_receipt_on).toBe(addDays(anchor,3));
    expect(stock('SLC').available).toBe(7);expect(stock('Ogden').available).toBe(20);expect(stock('Provo').available).toBe(0);
  });

  it('sets up Wasatch as in the mockup',()=>{
    const w=get<Record<string,unknown>>("SELECT * FROM customers WHERE id='wasatch'");
    expect(w).toMatchObject({name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',terms:'Net 30',credit_limit:50000,open_balance:18420,past_due_balance:0,tax_status:'taxable',tax_state:'UT'});
    expect(get("SELECT name,title,is_primary FROM contacts WHERE customer_id='wasatch'")).toEqual({name:'Dana Ortiz',title:'Purchasing',is_primary:1});
  });

  it('puts the Wasatch ship-to in Salt Lake County, 12 mi straight-line from SLC (spec §5.3 example)',()=>{
    const w=get<{ship_to_lat:number;ship_to_lng:number;ship_to_city:string;ship_to_address:string}>("SELECT * FROM customers WHERE id='wasatch'");
    expect(w.ship_to_address).not.toBe('');
    expect(w.ship_to_lat).toBeGreaterThan(40.42);expect(w.ship_to_lat).toBeLessThan(40.85);
    expect(w.ship_to_lng).toBeGreaterThan(-112.25);expect(w.ship_to_lng).toBeLessThan(-111.55);
    const slc=get<{lat:number;lng:number}>("SELECT lat,lng FROM branches WHERE code='SLC'");
    const miles=milesBetween(slc,{lat:w.ship_to_lat,lng:w.ship_to_lng});
    expect(miles).toBeGreaterThan(11.95);expect(miles).toBeLessThan(12.05);
  });

  it('gives Wasatch a price level with a customer price for every SKU, between cost and list',()=>{
    const level=value<string>("SELECT price_level_id FROM customers WHERE id='wasatch'");
    expect(level).toBeTruthy();
    const rows=all<{sku:string;cost:number;list_price:number;unit_price:number}>('SELECT i.sku,i.cost,i.list_price,p.unit_price FROM customer_prices p JOIN items i ON i.id=p.item_id WHERE p.price_level_id=?',level);
    expect(rows.length).toBe(value<number>('SELECT count(*) FROM items'));
    for(const r of rows){expect(r.unit_price,r.sku).toBeGreaterThan(r.cost);expect(r.unit_price,r.sku).toBeLessThanOrEqual(r.list_price);}
  });

  it('has one active Wasatch contract on part of the catalog, and an expired one',()=>{
    const active=all<{id:string;starts_on:string;ends_on:string}>('SELECT * FROM contracts WHERE starts_on<=? AND ends_on>=?',anchor,anchor);
    expect(active).toHaveLength(1);
    const lines=value<number>('SELECT count(*) FROM contract_lines WHERE contract_id=?',active[0].id);
    expect(lines).toBeGreaterThan(0);expect(lines).toBeLessThan(value<number>('SELECT count(*) FROM items')/2);
    expect(value('SELECT l.unit_price FROM contract_lines l WHERE l.contract_id=? AND l.item_id=?',active[0].id,itemId('CW-45-045-T1'))).toBe(36);
    expect(active[0].ends_on>anchor).toBe(true);
    expect(value('SELECT count(*) FROM contracts WHERE ends_on<?',anchor)).toBe(1);
  });

  it('keeps orders, quotes, prices, contracts, contacts, chats and logs to Wasatch only',()=>{
    for(const sql of ['SELECT DISTINCT customer_id FROM orders','SELECT DISTINCT customer_id FROM quotes','SELECT DISTINCT customer_id FROM contracts','SELECT DISTINCT customer_id FROM contacts','SELECT DISTINCT customer_id FROM conversations','SELECT DISTINCT customer_id FROM query_logs','SELECT id FROM customers WHERE price_level_id IS NOT NULL'])expect(column(sql),sql).toEqual(['wasatch']);
  });

  it('has 2-3 placeholder customers with only a name, account number and assigned rep',()=>{
    const placeholders=all<Record<string,unknown>>("SELECT * FROM customers WHERE id<>'wasatch'");
    expect(placeholders.length).toBeGreaterThanOrEqual(2);expect(placeholders.length).toBeLessThanOrEqual(3);
    for(const p of placeholders){
      expect(p.name).toBeTruthy();expect(p.account_number).toBeTruthy();
      for(const key of ['terms','credit_limit','open_balance','tax_status','price_level_id','ship_to_address','ship_to_lat','main_phone'])expect(p[key],`${p.id}.${key}`).toBeNull();
      expect(value('SELECT rep_id FROM customer_rep WHERE customer_id=?',p.id)).toBeTruthy();
    }
    expect(column('SELECT name FROM customers')).not.toContain('Bonneville Grading Co.');
  });

  it('has 12 months of Wasatch orders; the last order is 14 days before the anchor',()=>{
    const dates=column<string>('SELECT order_date FROM orders ORDER BY order_date');
    expect(dates.length).toBeGreaterThanOrEqual(18);
    expect(dates[0]>=addDays(anchor,-365)).toBe(true);
    expect(dates.at(-1)).toBe(addDays(anchor,-14));
    const months=new Set(dates.map(x=>x.slice(0,7)));expect(months.size).toBeGreaterThanOrEqual(10);
    for(const o of all<{subtotal:number;freight:number;tax:number;total:number;id:string}>('SELECT * FROM orders')){
      const lines=value<number>('SELECT round(sum(qty*unit_price),2) FROM order_lines WHERE order_id=?',o.id);
      expect(o.subtotal,o.id).toBeCloseTo(lines,2);
      expect(o.total,o.id).toBeCloseTo(o.subtotal+o.freight+o.tax,2);
    }
  });

  it('reproduces the mockup last-paid facts from order history',()=>{
    const lastPaid=(sku:string)=>get<{unit_price:number;order_date:string}|undefined>('SELECT l.unit_price,o.order_date FROM order_lines l JOIN orders o ON o.id=l.order_id WHERE l.item_id=? AND o.customer_id=? AND o.order_date>=? ORDER BY o.order_date DESC LIMIT 1',itemId(sku),'wasatch',addDays(anchor,-365));
    expect(lastPaid('HCS-12-13-2G8')).toEqual({unit_price:31.5,order_date:addDays(anchor,-42)});
    expect(lastPaid('CW-45-045-T1')).toEqual({unit_price:36,order_date:addDays(anchor,-14)});
    expect(lastPaid('GLV-N8-L-1000')).toEqual({unit_price:79,order_date:addDays(anchor,-14)});
    expect(lastPaid('RS-2-27-JH')).toBeUndefined();
    expect(value("SELECT count(*) FROM order_lines l JOIN items i ON i.id=l.item_id WHERE i.sku LIKE 'RS-%'")).toBe(0);
    // Customer price sits below last paid on bolts and gloves, so the pricing engine has a fact to lift on.
    const customerPrice=(sku:string)=>value<number>("SELECT p.unit_price FROM customer_prices p JOIN customers c ON c.price_level_id=p.price_level_id WHERE c.id='wasatch' AND p.item_id=?",itemId(sku));
    expect(customerPrice('HCS-12-13-2G8')).toBeLessThan(31.5);
    expect(customerPrice('GLV-N8-L-1000')).toBeLessThan(79);
  });

  it('has past quotes won and lost at about a 71% win rate, each won quote linked to its order',()=>{
    const past=all<{id:string;status:string}>("SELECT id,status FROM quotes WHERE is_sample=0");
    expect(past.every(q=>['accepted','expired'].includes(q.status))).toBe(true);
    const won=past.filter(q=>q.status==='accepted').length;
    expect(Math.round(won/past.length*100)).toBe(71);
    for(const q of past){
      expect(value<number>('SELECT count(*) FROM orders WHERE quote_id=?',q.id),q.id).toBe(q.status==='accepted'?1:0);
      expect(value<number>('SELECT count(*) FROM quote_lines WHERE quote_id=?',q.id),q.id).toBeGreaterThan(0);
      expect(value<number>('SELECT count(*) FROM quote_revisions WHERE quote_id=?',q.id),q.id).toBe(1);
    }
    expect(value("SELECT count(*) FROM quotes WHERE status='expired' AND valid_until>=?",anchor)).toBe(0);
  });

  it('assigns every quote to the customer\'s assigned rep',()=>{
    expect(value('SELECT count(*) FROM quotes q JOIN customer_rep cr ON cr.customer_id=q.customer_id WHERE q.rep_id<>cr.rep_id')).toBe(0);
  });

  it('has Brandi plus three other reps, one rep per customer, and Wasatch assigned to Brandi',()=>{
    const reps=column<string>('SELECT name FROM reps ORDER BY name');
    expect(reps).toHaveLength(4);expect(reps).toContain('Brandi Gallegos');
    expect(get("SELECT initials,email FROM reps WHERE id='brandi'")).toEqual({initials:'BG',email:'brandi.gallegos@herrickindustrial.com'});
    expect(value("SELECT rep_id FROM customer_rep WHERE customer_id='wasatch'")).toBe('brandi');
    expect(value('SELECT count(*) FROM customer_rep')).toBe(value('SELECT count(*) FROM customers'));
  });

  it('has a margin floor for every rep x category: 20%, with a few of Brandi\'s different',()=>{
    expect(value('SELECT count(*) FROM rep_category_floors')).toBe(value<number>('SELECT count(*) FROM reps')*value<number>('SELECT count(*) FROM product_categories'));
    expect(value('SELECT count(*) FROM reps r CROSS JOIN product_categories c LEFT JOIN rep_category_floors f ON f.rep_id=r.id AND f.category_id=c.id WHERE f.margin_floor IS NULL')).toBe(0);
    expect(column("SELECT DISTINCT margin_floor FROM rep_category_floors WHERE rep_id<>'brandi'")).toEqual([0.2]);
    const brandi=all<{name:string;margin_floor:number}>("SELECT c.name,f.margin_floor FROM rep_category_floors f JOIN product_categories c ON c.id=f.category_id WHERE f.rep_id='brandi'");
    const different=brandi.filter(f=>f.margin_floor!==0.2);
    expect(different.length).toBeGreaterThanOrEqual(2);expect(different.length).toBeLessThan(brandi.length);
    expect(brandi.find(f=>f.name==='Fasteners')?.margin_floor).toBe(0.2);
  });

  it('has static departments: Customer Service, AR/Finance and will-call per branch',()=>{
    const departments=all<{name:string;phone:string;branch_id:string|null}>('SELECT * FROM departments ORDER BY sort_order');
    expect(departments.map(x=>x.name).slice(0,2)).toEqual(['Customer Service','Accounts Receivable / Finance']);
    const willCall=all<{phone:string;will_call_phone:string}>('SELECT d.phone,b.will_call_phone FROM departments d JOIN branches b ON b.id=d.branch_id');
    expect(willCall).toHaveLength(3);
    for(const w of willCall)expect(w.phone).toBe(w.will_call_phone);
  });

  it('has the spec delivery rates',()=>{
    expect(get('SELECT base_fee,per_mile,min_charge,free_threshold,max_radius_miles FROM delivery_rates')).toEqual({base_fee:25,per_mile:2.5,min_charge:35,free_threshold:1500,max_radius_miles:75});
  });

  it('seeds sample quote Q-24817 ready for review, as Dana requested it',()=>{
    const q=get<Record<string,unknown>>("SELECT * FROM quotes WHERE quote_number='Q-24817'");
    expect(q).toMatchObject({id:'q-24817',status:'ready_for_review',customer_id:'wasatch',contact_id:'dana',rep_id:'brandi',revision:0,fulfillment:'will_call',branch_id:'slc',is_sample:1,unread_for_rep:1,valid_days:14,valid_until:null,requested_at:`${anchor}T16:14:00.000Z`});
    expect(String(q.request_text)).toMatch(/1\/2 in grade 8 hex bolts/);
    const lines=all<{sku:string;qty:number;unit_price:number;price_basis:string;unit_cost:number}>("SELECT i.sku,l.qty,l.unit_price,l.price_basis,l.unit_cost FROM quote_lines l JOIN items i ON i.id=l.item_id WHERE l.quote_id='q-24817' ORDER BY l.line_no");
    expect(lines.map(l=>[l.sku,l.qty])).toEqual([['HCS-12-13-2G8',10],['CW-45-045-T1',6],['GLV-N8-L-1000',4],['RS-2-27-JH',12]]);
    expect(lines.map(l=>[l.unit_price,l.price_basis])).toEqual([[31.5,'last_paid'],[36,'contract'],[79,'last_paid'],[22.95,'customer']]);
    expect(value("SELECT count(*) FROM quote_revisions WHERE quote_id='q-24817'")).toBe(0);
    expect(value<number>("SELECT count(*) FROM quote_activity WHERE quote_id='q-24817'")).toBeGreaterThanOrEqual(3);
    const first=get<{role:string;content:string}>('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY created_at LIMIT 1',q.conversation_id);
    expect(first).toEqual({role:'customer',content:q.request_text});
    expect(value("SELECT max(quote_number) FROM quotes")).toBe('Q-24817');
  });

  it('can restore Q-24817 after it has been edited (Reset sample quote)',()=>{
    d.prepare("UPDATE quotes SET status='sent',revision=1 WHERE id='q-24817'").run();
    d.prepare("DELETE FROM quote_lines WHERE quote_id='q-24817' AND line_no=4").run();
    d.prepare("INSERT INTO quote_notes(quote_id,rep_id,body,created_at) VALUES('q-24817','brandi','Call Dana first','2026-01-01T00:00:00.000Z')").run();
    d.prepare("INSERT INTO quote_removed_lines(quote_id,line_no,item_id,added_by,removed_at) VALUES('q-24817',4,'RS-2-27-JH','querent','2026-01-01T00:00:00.000Z')").run();
    seedSampleQuote(d,anchor);
    // Undo can't put back a line the reset already restored.
    expect(value("SELECT count(*) FROM quote_removed_lines WHERE quote_id='q-24817'")).toBe(0);
    expect(get("SELECT status,revision FROM quotes WHERE id='q-24817'")).toEqual({status:'ready_for_review',revision:0});
    expect(value("SELECT count(*) FROM quote_lines WHERE quote_id='q-24817'")).toBe(4);
    expect(value("SELECT count(*) FROM quote_notes WHERE quote_id='q-24817'")).toBe(0);
    expect(value("SELECT count(*) FROM quotes WHERE is_sample=1")).toBe(1);
  });

  it('has Wasatch chat query logs across the information categories',()=>{
    const logs=all<{categories:string;timestamp:string}>('SELECT categories,timestamp FROM query_logs');
    expect(logs.length).toBeGreaterThanOrEqual(30);
    const seen=new Set(logs.flatMap(l=>JSON.parse(l.categories) as string[]));
    expect([...seen].sort()).toEqual([...INFO_CATEGORIES].sort());
    expect(logs.every(l=>l.timestamp<`${addDays(anchor,1)}T00:00:00.000Z`)).toBe(true);
  });

  it('turns every information category on for every customer',()=>{
    expect(value('SELECT count(*) FROM access WHERE enabled=1')).toBe(value<number>('SELECT count(*) FROM customers')*INFO_CATEGORIES.length);
  });

  it('marks every ERP-sourced table with source, external_id and synced_at',()=>{
    for(const table of ERP_SOURCED_TABLES){
      const columns=column<string>(`SELECT name FROM pragma_table_info('${table}')`);
      for(const c of ['source','external_id','synced_at'])expect(columns,`${table}.${c}`).toContain(c);
      expect(value(`SELECT count(*) FROM ${table} WHERE source<>'seed' OR external_id IS NULL OR synced_at IS NULL`),table).toBe(0);
    }
    expect(ERP_SOURCED_TABLES).toEqual(expect.arrayContaining(['items','branch_stock','customer_prices','contracts','contract_lines','customers','orders','order_lines']));
  });
});
