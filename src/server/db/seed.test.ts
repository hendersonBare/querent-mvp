import Database from 'better-sqlite3';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {applySchema,ERP_SOURCED_TABLES} from './schema';
import {seedDatabase,seedSampleQuote} from './seed';
import {addDays} from './seed/dates';

// Seed invariants (task 0.2), for the BOXT Packaging demo. Every date in the seed is an offset from
// the anchor (the day Megan sent the Q-24817 request), so run the checks at the mockup's date and
// at a later one to prove nothing depends on the calendar.
const MOCKUP_ANCHOR='2026-09-23';
const STORY_SKUS=['T902170','T905170','T902400','SF188CAST','SF188','SF188B','MSF2080B','THL576','THD114','DL1082','B833','B855SS','B873','1296-BDL','1296-PLT','TDWH2'];
const CATEGORY_NAMES=['Boxes','Mailers','Tape & Strapping','Bags','Stretch Wrap','Bubble, Foam & Cushioning','Paper & Kraft','Labels','Storage & Fulfillment'];
const CUSTOMER='timpanogos';
const INFO_CATEGORIES=['items_stock','pricing','orders_quotes','account'];

function open(anchor:string){const d=new Database(':memory:');d.pragma('foreign_keys = ON');applySchema(d);seedDatabase(d,{anchor});return d;}
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

  it('has BOXT Packaging as the one supplier, as boxtpackaging.com lists it, with scarcity uplift off',()=>{
    expect(all('SELECT name,address,city,state,zip,phone,email,website FROM suppliers')).toEqual([{name:'BOXT Packaging',address:'587 W 1000 N',city:'Spanish Fork',state:'UT',zip:'84660',phone:'(385) 327-3166',email:'hello@boxtpackaging.com',website:'boxtpackaging.com'}]);
    expect(value("SELECT value FROM settings WHERE key='scarcity_uplift_enabled'")).toBe('false');
  });

  it('has the Spanish Fork headquarters as the one branch, with its will-call phone',()=>{
    const branches=all<{code:string;lat:number;lng:number;will_call_phone:string;address:string;zip:string}>('SELECT * FROM branches ORDER BY code');
    expect(branches.map(b=>[b.code,b.address,b.zip,b.will_call_phone])).toEqual([['Spanish Fork','587 W 1000 N','84660','(385) 327-3166']]);
    expect(branches[0].lat).toBeGreaterThan(40.1);expect(branches[0].lat).toBeLessThan(40.15);
    expect(branches[0].lng).toBeGreaterThan(-111.7);expect(branches[0].lng).toBeLessThan(-111.63);
  });

  it('has the nine boxtpackaging.com categories in order',()=>{
    expect(column('SELECT name FROM product_categories ORDER BY sort_order')).toEqual(CATEGORY_NAMES);
  });

  it('has the full boxtpackaging.com catalog, each SKU with cost, list, case qty and a category',()=>{
    const items=all<{sku:string;cost:number;list_price:number;case_qty:number;category_id:string;pack:string}>('SELECT * FROM items');
    expect(items.length).toBeGreaterThanOrEqual(1500);
    for(const i of items){
      expect(i.cost,i.sku).toBeGreaterThan(0);
      expect(i.list_price,i.sku).toBeGreaterThan(i.cost);
      expect(Number.isInteger(i.case_qty)&&i.case_qty>=1,i.sku).toBe(true);
      expect(i.pack,i.sku).not.toBe('');
    }
    for(const name of CATEGORY_NAMES)expect(value<number>('SELECT count(*) FROM items i JOIN product_categories c ON c.id=i.category_id WHERE c.name=?',name),name).toBeGreaterThanOrEqual(20);
  });

  it('carries the site\'s wording, pack and list price, with the story cost on the Q-24817 lines',()=>{
    const skus=new Set(column<string>('SELECT sku FROM items'));
    for(const sku of STORY_SKUS)expect(skus.has(sku),sku).toBe(true);
    const item=(sku:string)=>get<{description:string;pack:string;case_qty:number;cost:number;list_price:number}>('SELECT description,pack,case_qty,cost,list_price FROM items WHERE sku=?',sku);
    expect(item('T902170')).toEqual({description:'Clear Acrylic Tape, Hand Length, 2"x110yd 1.8 MIL',pack:'Case of 36',case_qty:1,cost:34.6,list_price:51.48});
    expect(item('SF188CAST')).toEqual({description:'Cast Stretch Wrap, Hand Length, 18"x1500\' 80 Gauge',pack:'Case of 4',case_qty:1,cost:52.4,list_price:81.08});
    expect(item('THL576')).toEqual({description:'White Direct Thermal Labels, Fanfold, 4x6"',pack:'Case of 4,000',case_qty:1,cost:132,list_price:186.8});
    expect(item('B833')).toEqual({description:'#2 Poly Bubble Mailers 8.5x12"',pack:'Case of 100',case_qty:1,cost:16.85,list_price:25.93});
    // Boxes sell by the box in bundles: a smaller qty is a broken bundle.
    expect(item('1296-BDL')).toMatchObject({description:'Corrugated Boxes 12x9x6", 32 ECT single wall, bundle pricing',pack:'Each',case_qty:25,list_price:0.94});
    expect(item('1296-PLT')).toMatchObject({list_price:0.85,pack:'Each'});
  });

  it('includes near-duplicates that need clarifying (cast vs blown, 1.8 vs 2.0 mil, fanfold vs desktop, poly vs kraft)',()=>{
    const descriptions=column<string>('SELECT description FROM items');
    const has=(re:RegExp)=>descriptions.some(x=>re.test(x));
    expect(has(/^Cast Stretch Wrap, Hand Length, 18"x1500' 80 Gauge$/)).toBe(true);
    expect(has(/^Blown Stretch Wrap, Hand Length, 18"x1500' 80 Gauge$/)).toBe(true);
    expect(has(/^Clear Acrylic Tape, Hand Length, 2"x110yd 2\.0 MIL$/)).toBe(true);
    expect(has(/^Clear Acrylic Tape, Hand Length, 3"x110yd 1\.8 MIL$/)).toBe(true);
    expect(has(/^White Direct Thermal Labels, Desktop, 4x6"$/)).toBe(true);
    expect(has(/^#2 Kraft Bubble Mailers 8\.5x12"$/)).toBe(true);
  });

  it('stocks every SKU at every branch',()=>{
    expect(value('SELECT count(*) FROM branch_stock')).toBe(value<number>('SELECT count(*) FROM items')*value<number>('SELECT count(*) FROM branches'));
    expect(value('SELECT count(*) FROM branch_stock WHERE available<0')).toBe(0);
  });

  it('has the #2 poly bubble mailers short at Spanish Fork, with a PO due in 3 days',()=>{
    const stock=get<{available:number;on_order:number;next_receipt_on:string|null}>("SELECT * FROM branch_stock WHERE item_id=? AND branch_id='spanish-fork'",itemId('B833'));
    const qty=value<number>("SELECT l.qty FROM quote_lines l JOIN items i ON i.id=l.item_id WHERE l.quote_id='q-24817' AND i.sku='B833'");
    expect(stock).toEqual({...stock,available:7,on_order:24,next_receipt_on:addDays(anchor,3)});
    expect(stock.available).toBeLessThan(qty);
  });

  it('sets up Timpanogos Fulfillment, a Utah County 3PL, with Megan as the contact',()=>{
    const c=get<Record<string,unknown>>('SELECT * FROM customers WHERE id=?',CUSTOMER);
    expect(c).toMatchObject({name:'Timpanogos Fulfillment Co.',account_number:'TFC-1142',terms:'Net 30',credit_limit:40000,open_balance:12860,past_due_balance:0,tax_status:'taxable',tax_state:'UT'});
    expect(get('SELECT name,title,is_primary FROM contacts WHERE customer_id=?',CUSTOMER)).toEqual({name:'Megan Hale',title:'Purchasing Manager',is_primary:1});
  });

  it('puts the ship-to in Lindon, inside the 85 mi delivery radius from Spanish Fork',()=>{
    const c=get<{ship_to_lat:number;ship_to_lng:number;ship_to_city:string;ship_to_address:string}>('SELECT * FROM customers WHERE id=?',CUSTOMER);
    expect(c.ship_to_address).not.toBe('');expect(c.ship_to_city).toBe('Lindon');
    const branch=get<{lat:number;lng:number}>("SELECT lat,lng FROM branches WHERE id='spanish-fork'");
    const miles=milesBetween(branch,{lat:c.ship_to_lat,lng:c.ship_to_lng});
    expect(miles).toBeGreaterThan(10);expect(miles).toBeLessThan(25);
  });

  it('gives the 3PL a price level with a customer price for every SKU, between cost and list',()=>{
    const level=value<string>('SELECT price_level_id FROM customers WHERE id=?',CUSTOMER);
    expect(level).toBeTruthy();
    const rows=all<{sku:string;cost:number;list_price:number;unit_price:number}>('SELECT i.sku,i.cost,i.list_price,p.unit_price FROM customer_prices p JOIN items i ON i.id=p.item_id WHERE p.price_level_id=?',level);
    expect(rows.length).toBe(value<number>('SELECT count(*) FROM items'));
    for(const r of rows){expect(r.unit_price,r.sku).toBeGreaterThan(r.cost);expect(r.unit_price,r.sku).toBeLessThanOrEqual(r.list_price);}
  });

  it('has one active contract on part of the catalog, and an expired one',()=>{
    const active=all<{id:string;starts_on:string;ends_on:string}>('SELECT * FROM contracts WHERE starts_on<=? AND ends_on>=?',anchor,anchor);
    expect(active).toHaveLength(1);
    const lines=value<number>('SELECT count(*) FROM contract_lines WHERE contract_id=?',active[0].id);
    expect(lines).toBeGreaterThan(0);expect(lines).toBeLessThan(value<number>('SELECT count(*) FROM items')/2);
    expect(value('SELECT l.unit_price FROM contract_lines l WHERE l.contract_id=? AND l.item_id=?',active[0].id,itemId('SF188CAST'))).toBe(69.95);
    expect(active[0].ends_on>anchor).toBe(true);
    expect(value('SELECT count(*) FROM contracts WHERE ends_on<?',anchor)).toBe(1);
  });

  it('keeps orders, quotes, prices, contracts, contacts, chats and logs to the 3PL only',()=>{
    for(const sql of ['SELECT DISTINCT customer_id FROM orders','SELECT DISTINCT customer_id FROM quotes','SELECT DISTINCT customer_id FROM contracts','SELECT DISTINCT customer_id FROM contacts','SELECT DISTINCT customer_id FROM conversations','SELECT DISTINCT customer_id FROM query_logs','SELECT id FROM customers WHERE price_level_id IS NOT NULL'])expect(column(sql),sql).toEqual([CUSTOMER]);
  });

  it('has 2-3 placeholder customers with only a name, account number and assigned rep',()=>{
    const placeholders=all<Record<string,unknown>>('SELECT * FROM customers WHERE id<>?',CUSTOMER);
    expect(placeholders.length).toBeGreaterThanOrEqual(2);expect(placeholders.length).toBeLessThanOrEqual(3);
    for(const p of placeholders){
      expect(p.name).toBeTruthy();expect(p.account_number).toBeTruthy();
      for(const key of ['terms','credit_limit','open_balance','tax_status','price_level_id','ship_to_address','ship_to_lat','main_phone'])expect(p[key],`${p.id}.${key}`).toBeNull();
      expect(value('SELECT rep_id FROM customer_rep WHERE customer_id=?',p.id)).toBeTruthy();
    }
  });

  it('has 12 months of 3PL orders; the last order is 14 days before the anchor',()=>{
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

  it('reproduces the Q-24817 last-paid facts from order history',()=>{
    const lastPaid=(sku:string)=>get<{unit_price:number;order_date:string}|undefined>('SELECT l.unit_price,o.order_date FROM order_lines l JOIN orders o ON o.id=l.order_id WHERE l.item_id=? AND o.customer_id=? AND o.order_date>=? ORDER BY o.order_date DESC LIMIT 1',itemId(sku),CUSTOMER,addDays(anchor,-365));
    expect(lastPaid('T902170')).toEqual({unit_price:48.75,order_date:addDays(anchor,-42)});
    expect(lastPaid('SF188CAST')).toEqual({unit_price:69.95,order_date:addDays(anchor,-14)});
    expect(lastPaid('THL576')).toEqual({unit_price:172,order_date:addDays(anchor,-14)});
    // Customer price sits below last paid on tape and labels, so the pricing engine has a fact to lift on;
    // the mailers were last bought at customer price, so they stay there.
    const customerPrice=(sku:string)=>value<number>('SELECT p.unit_price FROM customer_prices p JOIN customers c ON c.price_level_id=p.price_level_id WHERE c.id=? AND p.item_id=?',CUSTOMER,itemId(sku));
    expect(customerPrice('T902170')).toBeLessThan(48.75);
    expect(customerPrice('THL576')).toBeLessThan(172);
    expect(lastPaid('B833')?.unit_price).toBe(customerPrice('B833'));
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

  it('has Landon, Eli and Keenan as the reps, one rep per customer, and the 3PL assigned to Landon',()=>{
    expect(all('SELECT id,name,initials,email FROM reps ORDER BY name')).toEqual([
      {id:'eli',name:'Eli',initials:'E',email:'eli@boxtpackaging.com'},
      {id:'keenan',name:'Keenan',initials:'K',email:'keenan@boxtpackaging.com'},
      {id:'landon',name:'Landon Richards',initials:'LR',email:'landon@boxtpackaging.com'},
    ]);
    expect(value("SELECT phone FROM reps WHERE id='landon'")).toBe('(385) 327-3166');
    expect(value('SELECT rep_id FROM customer_rep WHERE customer_id=?',CUSTOMER)).toBe('landon');
    expect(value('SELECT count(*) FROM customer_rep')).toBe(value('SELECT count(*) FROM customers'));
  });

  it('has a margin floor for every rep x category: 20%, with a few of Landon\'s different',()=>{
    expect(value('SELECT count(*) FROM rep_category_floors')).toBe(value<number>('SELECT count(*) FROM reps')*value<number>('SELECT count(*) FROM product_categories'));
    expect(value('SELECT count(*) FROM reps r CROSS JOIN product_categories c LEFT JOIN rep_category_floors f ON f.rep_id=r.id AND f.category_id=c.id WHERE f.margin_floor IS NULL')).toBe(0);
    expect(column("SELECT DISTINCT margin_floor FROM rep_category_floors WHERE rep_id<>'landon'")).toEqual([0.2]);
    const landon=all<{name:string;margin_floor:number}>("SELECT c.name,f.margin_floor FROM rep_category_floors f JOIN product_categories c ON c.id=f.category_id WHERE f.rep_id='landon'");
    const different=landon.filter(f=>f.margin_floor!==0.2);
    expect(different.length).toBeGreaterThanOrEqual(2);expect(different.length).toBeLessThan(landon.length);
    expect(landon.find(f=>f.name==='Labels')?.margin_floor).toBe(0.25);
  });

  it('has static departments: Customer Service and will-call at Spanish Fork',()=>{
    const departments=all<{name:string;phone:string;email:string|null;branch_id:string|null}>('SELECT * FROM departments ORDER BY sort_order');
    expect(departments.map(x=>[x.name,x.phone,x.email])).toEqual([['Customer Service','(385) 327-3166','hello@boxtpackaging.com'],['Warehouse / Will-call · Spanish Fork','(385) 327-3166',null]]);
  });

  it('has BOXT\'s local delivery rates: free at $1,000+, a flat $100 under, 85 mi radius',()=>{
    expect(get('SELECT base_fee,per_mile,min_charge,free_threshold,max_radius_miles,road_factor FROM delivery_rates')).toEqual({base_fee:100,per_mile:0,min_charge:100,free_threshold:1000,max_radius_miles:85,road_factor:1});
    // Ogden to Nephi, as the site says.
    const branch=get<{lat:number;lng:number}>("SELECT lat,lng FROM branches WHERE id='spanish-fork'");
    expect(milesBetween(branch,{lat:41.223,lng:-111.9738})).toBeLessThan(85);
    expect(milesBetween(branch,{lat:39.7102,lng:-111.8363})).toBeLessThan(85);
  });

  it('seeds sample quote Q-24817 ready for review, as Megan requested it',()=>{
    const q=get<Record<string,unknown>>("SELECT * FROM quotes WHERE quote_number='Q-24817'");
    expect(q).toMatchObject({id:'q-24817',status:'ready_for_review',customer_id:CUSTOMER,contact_id:'megan',rep_id:'landon',revision:0,fulfillment:'will_call',branch_id:'spanish-fork',is_sample:1,unread_for_rep:1,valid_days:14,valid_until:null,requested_at:`${anchor}T16:14:00.000Z`});
    expect(String(q.request_text)).toMatch(/2 in clear acrylic tape/);
    const lines=all<{sku:string;qty:number;unit_price:number;price_basis:string;unit_cost:number}>("SELECT i.sku,l.qty,l.unit_price,l.price_basis,l.unit_cost FROM quote_lines l JOIN items i ON i.id=l.item_id WHERE l.quote_id='q-24817' ORDER BY l.line_no");
    expect(lines.map(l=>[l.sku,l.qty])).toEqual([['T902170',10],['SF188CAST',6],['THL576',4],['B833',12]]);
    expect(lines.map(l=>[l.unit_price,l.price_basis])).toEqual([[48.75,'last_paid'],[69.95,'contract'],[172,'last_paid'],[23.4,'customer']]);
    // The labels line sits under Landon's 25% Labels floor.
    const labels=lines[2];expect((labels.unit_price-labels.unit_cost)/labels.unit_price).toBeLessThan(0.25);
    expect(value("SELECT count(*) FROM quote_revisions WHERE quote_id='q-24817'")).toBe(0);
    expect(value<number>("SELECT count(*) FROM quote_activity WHERE quote_id='q-24817'")).toBeGreaterThanOrEqual(3);
    const first=get<{role:string;content:string}>('SELECT role,content FROM messages WHERE conversation_id=? ORDER BY created_at LIMIT 1',q.conversation_id);
    expect(first).toEqual({role:'customer',content:q.request_text});
    expect(value("SELECT max(quote_number) FROM quotes")).toBe('Q-24817');
  });

  it('can restore Q-24817 after it has been edited (Reset sample quote)',()=>{
    d.prepare("UPDATE quotes SET status='sent',revision=1 WHERE id='q-24817'").run();
    d.prepare("DELETE FROM quote_lines WHERE quote_id='q-24817' AND line_no=4").run();
    d.prepare("INSERT INTO quote_notes(quote_id,rep_id,body,created_at) VALUES('q-24817','landon','Call Megan first','2026-01-01T00:00:00.000Z')").run();
    d.prepare("INSERT INTO quote_removed_lines(quote_id,line_no,item_id,added_by,removed_at) VALUES('q-24817',4,'B833','querent','2026-01-01T00:00:00.000Z')").run();
    seedSampleQuote(d,anchor);
    // Undo can't put back a line the reset already restored.
    expect(value("SELECT count(*) FROM quote_removed_lines WHERE quote_id='q-24817'")).toBe(0);
    expect(get("SELECT status,revision FROM quotes WHERE id='q-24817'")).toEqual({status:'ready_for_review',revision:0});
    expect(value("SELECT count(*) FROM quote_lines WHERE quote_id='q-24817'")).toBe(4);
    expect(value("SELECT count(*) FROM quote_notes WHERE quote_id='q-24817'")).toBe(0);
    expect(value("SELECT count(*) FROM quotes WHERE is_sample=1")).toBe(1);
  });

  it('has 3PL chat query logs across the information categories',()=>{
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
