import 'server-only';
import {randomUUID} from 'node:crypto';
import {db} from './db';
import {categories,type Category} from '@/lib/contracts';

export type Row=Record<string,unknown>;
export const CUSTOMER_IDS=['wasatch','bonneville'] as const;
export const isCategory=(value:string):value is Category=>(categories as readonly string[]).includes(value);
const tableFor=(category:Category)=>category;

export function customers(){return db().prepare('SELECT id,name FROM customers ORDER BY name DESC').all() as Row[];}
export function reps(){return db().prepare('SELECT * FROM reps ORDER BY name').all() as Row[];}
export function access(customerId:string){return db().prepare(`SELECT a.category,CAST(a.enabled AS INTEGER) enabled,a.rep_id,r.name rep_name,r.phone,r.email FROM access a LEFT JOIN reps r ON r.id=a.rep_id WHERE a.customer_id=? ORDER BY a.category`).all(customerId) as Row[];}
export function aggregateAccess(ids:string[]){
  return categories.map(category=>{const rows=ids.map(id=>access(id).find(r=>r.category===category)!);const enabled=rows.every(r=>r.enabled===1)?true:rows.every(r=>r.enabled===0)?false:null;const repIds=new Set(rows.map(r=>r.rep_id));const first=rows[0];return {category,enabled,rep_id:repIds.size===1?first.rep_id:null,mixed_rep:repIds.size>1,rep_name:repIds.size>1?'Multiple reps':first.rep_name||'Self-serve',phone:repIds.size===1?first.phone:null,email:repIds.size===1?first.email:null};});
}
export function setAccess(scope:string|null,category:Category,enabled:boolean){db().prepare(`UPDATE access SET enabled=? WHERE category=?${scope?' AND customer_id=?':''}`).run(...(scope?[enabled?1:0,category,scope]:[enabled?1:0,category]));}
export function assignRep(scope:string|null,category:Category,repId:string|null){db().prepare(`UPDATE access SET rep_id=? WHERE category=?${scope?' AND customer_id=?':''}`).run(...(scope?[repId,category,scope]:[repId,category]));}
export function browse(scope:string|null,category:Category,page:number,size:number){const shared=['parts_stock','equipment_stock'].includes(category);const where=!shared&&scope?' WHERE customer_id=?':'';const params=where?[scope]:[];const total=(db().prepare(`SELECT count(*) count FROM ${tableFor(category)}${where}`).get(...params) as {count:number}).count;const rows=db().prepare(`SELECT * FROM ${tableFor(category)}${where} ORDER BY id LIMIT ? OFFSET ?`).all(...params,size,(page-1)*size) as Row[];return {rows,total,page,size};}
export function enabledCategories(customerId:string){return new Set(access(customerId).filter(x=>x.enabled===1).map(x=>x.category as Category));}
export function history(customerId:string,conversationId:string):Row[]{return (db().prepare('SELECT id,question,answer,sql,categories,outcome,row_count,timestamp FROM query_logs WHERE customer_id=? AND conversation_id=? ORDER BY timestamp').all(customerId,conversationId) as Row[]).map(r=>({...r,categories:JSON.parse(String(r.categories))}) as Row);}
export function context(customerId:string,conversationId:string,allowed:Set<Category>){return history(customerId,conversationId).filter(r=>['answered','no_rows'].includes(String(r.outcome))&&(r.categories as Category[]).every(c=>allowed.has(c))).slice(-12);}
export function appendLog(value:{customerId:string;conversationId:string;question:string;categories:Category[];handled:Category[];sql:string|null;rowCount:number;latency:number;outcome:string;answer:string}){db().prepare('INSERT INTO query_logs VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),value.customerId,value.conversationId,value.question,JSON.stringify(value.categories),JSON.stringify(value.handled),value.sql,value.rowCount,value.latency,value.outcome,value.answer,new Date().toISOString());}
export function analytics(scope:string|null){const where=scope?' WHERE customer_id=?':'';const logs=db().prepare(`SELECT categories,handled_categories,outcome FROM query_logs${where}`).all(...(scope?[scope]:[])) as {categories:string;handled_categories:string;outcome:string}[];const ids=scope?[scope]:[...CUSTOMER_IDS];const rules=aggregateAccess(ids);const counts=new Map(categories.map(c=>[c,0]));let minutes=0;const base:Record<Category,number>={parts_stock:8,equipment_stock:12,service_records:15,orders_past:7,orders_current:7,financing:12,other:5};for(const log of logs){const handled=JSON.parse(log.handled_categories) as Category[];handled.forEach(c=>counts.set(c,(counts.get(c)||0)+1));if(['answered','no_rows'].includes(log.outcome)&&handled.length)minutes+=Math.max(...handled.map(c=>base[c]));}return {total_queries:logs.length,minutes_saved:minutes,hours_saved:(minutes/60).toFixed(1),categories:categories.map(category=>({category,count:counts.get(category)||0,rep_name:rules.find(r=>r.category===category)?.rep_name||'Self-serve'}))};}
export function events(includeAll:boolean){const rows=db().prepare(`SELECT * FROM sync_events ORDER BY timestamp DESC LIMIT ${includeAll?10:1}`).all() as Row[];return {last_updated:rows[0]?.timestamp||null,events:includeAll?rows:[]};}
export function heartbeat(){db().prepare('INSERT INTO sync_events(timestamp,message) VALUES(?,?)').run(new Date().toISOString(),'ERP connection refreshed');db().prepare('DELETE FROM sync_events WHERE id NOT IN (SELECT id FROM sync_events ORDER BY timestamp DESC LIMIT 100)').run();}
export function queryRows(sql:string,params:unknown[]=[]){return db().prepare(sql).all(...params).slice(0,200) as Row[];}
