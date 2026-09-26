import 'server-only';
import {randomUUID} from 'node:crypto';
import {db} from './db';
import {categories,type Category} from '@/lib/contracts';

export type Row=Record<string,unknown>;
export const isCategory=(value:string):value is Category=>(categories as readonly string[]).includes(value);

export function customerIds(){return db().prepare('SELECT id FROM customers ORDER BY name').pluck().all() as string[];}
export function customers(){return db().prepare('SELECT id,name,account_number FROM customers ORDER BY name').all() as Row[];}
export function reps(){return db().prepare('SELECT id,name,initials,title,phone,email FROM reps ORDER BY name').all() as Row[];}
/** Each customer has exactly one rep (customer_rep). */
export function assignedRep(customerId:string){return db().prepare('SELECT r.id,r.name,r.phone,r.email FROM customer_rep cr JOIN reps r ON r.id=cr.rep_id WHERE cr.customer_id=?').get(customerId) as {id:string;name:string;phone:string;email:string}|undefined;}
/** The customer's information-category toggles, each with the customer's rep as the contact. */
export function access(customerId:string){return db().prepare(`SELECT a.category,CAST(a.enabled AS INTEGER) enabled,cr.rep_id,r.name rep_name,r.phone,r.email FROM access a LEFT JOIN customer_rep cr ON cr.customer_id=a.customer_id LEFT JOIN reps r ON r.id=cr.rep_id WHERE a.customer_id=? ORDER BY a.category`).all(customerId) as Row[];}
export function aggregateAccess(ids:string[]){
  return categories.map(category=>{const rows=ids.map(id=>access(id).find(r=>r.category===category)!);const enabled=rows.every(r=>r.enabled===1)?true:rows.every(r=>r.enabled===0)?false:null;const repIds=new Set(rows.map(r=>r.rep_id));const first=rows[0];return {category,enabled,rep_id:repIds.size===1?first.rep_id:null,mixed_rep:repIds.size>1,rep_name:repIds.size>1?'Multiple reps':first.rep_name||'Self-serve',phone:repIds.size===1?first.phone:null,email:repIds.size===1?first.email:null};});
}
export function setAccess(scope:string|null,category:Category,enabled:boolean){db().prepare(`UPDATE access SET enabled=? WHERE category=?${scope?' AND customer_id=?':''}`).run(...(scope?[enabled?1:0,category,scope]:[enabled?1:0,category]));}

// Read-only record views for the supplier Data browser, one per information category.
// `scope` filters customer-specific views; items and stock are shared by every customer.
const views:Record<Category,{select:string;scopeColumn:string|null;order:string}>={
  items_stock:{select:"SELECT i.sku id,i.sku,i.description,c.name category,i.pack,(SELECT group_concat(stock,' · ') FROM (SELECT b.code||' '||s.available stock FROM branch_stock s JOIN branches b ON b.id=s.branch_id WHERE s.item_id=i.id ORDER BY b.rowid)) available FROM items i JOIN product_categories c ON c.id=i.category_id",scopeColumn:null,order:'c.sort_order,i.sku'},
  pricing:{select:'SELECT p.id,cu.id customer_id,i.sku,i.description,i.pack,i.list_price,p.unit_price customer_price FROM customers cu JOIN customer_prices p ON p.price_level_id=cu.price_level_id JOIN items i ON i.id=p.item_id',scopeColumn:'cu.id',order:'cu.name,i.sku'},
  orders_quotes:{select:'SELECT o.id,o.customer_id,o.order_number,o.po_number,o.order_date,o.status,o.total FROM orders o',scopeColumn:'o.customer_id',order:'o.order_date DESC'},
  account:{select:'SELECT cu.id,cu.id customer_id,cu.account_number,cu.terms,cu.credit_limit,cu.open_balance,r.name rep FROM customers cu LEFT JOIN customer_rep cr ON cr.customer_id=cu.id LEFT JOIN reps r ON r.id=cr.rep_id',scopeColumn:'cu.id',order:'cu.name'},
};
export function browse(scope:string|null,category:Category,page:number,size:number){
  const view=views[category];const where=scope&&view.scopeColumn?` WHERE ${view.scopeColumn}=?`:'';const params=where?[scope]:[];
  const total=db().prepare(`SELECT count(*) FROM (${view.select}${where})`).pluck().get(...params) as number;
  const rows=db().prepare(`${view.select}${where} ORDER BY ${view.order} LIMIT ? OFFSET ?`).all(...params,size,(page-1)*size) as Row[];
  return {rows,total,page,size};
}
export function enabledCategories(customerId:string){return new Set(access(customerId).filter(x=>x.enabled===1).map(x=>x.category as Category));}
export function history(customerId:string,conversationId:string):Row[]{return (db().prepare('SELECT id,question,answer,categories,outcome,row_count,timestamp FROM query_logs WHERE customer_id=? AND conversation_id=? ORDER BY timestamp').all(customerId,conversationId) as Row[]).map(r=>({...r,sql:null,categories:JSON.parse(String(r.categories))}) as Row);}
export function appendLog(value:{customerId:string;conversationId:string;question:string;categories:Category[];handled:Category[];toolCalls:string[];rowCount:number;latency:number;outcome:string;answer:string}){db().prepare('INSERT INTO query_logs(id,customer_id,conversation_id,question,categories,handled_categories,tool_calls,row_count,latency_ms,outcome,answer,timestamp) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),value.customerId,value.conversationId,value.question,JSON.stringify(value.categories),JSON.stringify(value.handled),JSON.stringify(value.toolCalls),value.rowCount,value.latency,value.outcome,value.answer,new Date().toISOString());}
export function analytics(scope:string|null){const where=scope?' WHERE customer_id=?':'';const logs=db().prepare(`SELECT categories,handled_categories,outcome FROM query_logs${where}`).all(...(scope?[scope]:[])) as {categories:string;handled_categories:string;outcome:string}[];const ids=scope?[scope]:customerIds();const rules=aggregateAccess(ids);const counts=new Map(categories.map(c=>[c,0]));let minutes=0;const base:Record<Category,number>={items_stock:8,pricing:10,orders_quotes:7,account:5};for(const log of logs){const handled=JSON.parse(log.handled_categories) as Category[];handled.forEach(c=>counts.set(c,(counts.get(c)||0)+1));if(['answered','no_rows'].includes(log.outcome)&&handled.length)minutes+=Math.max(...handled.map(c=>base[c]));}return {total_queries:logs.length,minutes_saved:minutes,hours_saved:(minutes/60).toFixed(1),categories:categories.map(category=>({category,count:counts.get(category)||0,rep_name:rules.find(r=>r.category===category)?.rep_name||'Self-serve'}))};}
export function events(includeAll:boolean){const rows=db().prepare(`SELECT * FROM sync_events ORDER BY timestamp DESC LIMIT ${includeAll?10:1}`).all() as Row[];return {last_updated:rows[0]?.timestamp||null,events:includeAll?rows:[]};}
export function heartbeat(){db().prepare('INSERT INTO sync_events(timestamp,message) VALUES(?,?)').run(new Date().toISOString(),'ERP connection refreshed');db().prepare('DELETE FROM sync_events WHERE id NOT IN (SELECT id FROM sync_events ORDER BY timestamp DESC LIMIT 100)').run();}
