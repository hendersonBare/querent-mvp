import 'server-only';
import type {QuoteFact,QuoteLineFact,RequestedItem,SentLineFact} from '@/domain';
import {categories,type Analytics,type Category} from '@/lib/contracts';
import {aggregateAccess} from './access';
import {customerIds} from './accounts';
import {all,bool,list} from './sql';

// Analytics reads (spec §4). `scope` is a customer id, a list of customer ids (a rep's customers,
// task 6.2), or null for every customer. An empty list matches no customer.

export type CustomerScope=string|readonly string[]|null;

/** The scope as a list of customer ids. */
const scopeIds=(scope:CustomerScope):string[]=>scope===null?customerIds():typeof scope==='string'?[scope]:[...scope];
/** Binds the scope for `customer_id IN (SELECT value FROM json_each(?))`. */
const bindScope=(scope:CustomerScope)=>list(scopeIds(scope));

/**
 * Chat log rows that are questions. The item pop-up's Request quote is logged as a chat turn too
 * (tool call request_quote, task 2.3) so the chat history shows it, but it asks nothing: it is left
 * out of the question counts, "questions answered without a rep" and the minutes saved.
 */
const QUESTIONS="customer_id IN (SELECT value FROM json_each(?)) AND NOT EXISTS (SELECT 1 FROM json_each(query_logs.tool_calls) t WHERE t.value='request_quote')";

/** Chat question counts per information category and the minutes they saved (the original query analytics). */
export function analytics(scope:CustomerScope):Analytics{
  const ids=scopeIds(scope);
  const logs=all<{handled_categories:string;outcome:string}>(`SELECT handled_categories,outcome FROM query_logs WHERE ${QUESTIONS}`,list(ids));
  const rules=ids.length?aggregateAccess(ids):[];
  const counts=new Map(categories.map(c=>[c,0]));
  const base:Record<Category,number>={items_stock:8,pricing:10,orders_quotes:7,account:5};
  let minutes=0;
  for(const log of logs){
    const handled=JSON.parse(log.handled_categories) as Category[];
    handled.forEach(c=>counts.set(c,(counts.get(c)||0)+1));
    if(['answered','no_rows'].includes(log.outcome)&&handled.length)minutes+=Math.max(...handled.map(c=>base[c]));
  }
  // No customers in scope: there is no rep to name.
  const repName=(category:Category)=>ids.length?rules.find(r=>r.category===category)?.rep_name||'Self-serve':'—';
  return {total_queries:logs.length,minutes_saved:minutes,hours_saved:(minutes/60).toFixed(1),categories:categories.map(category=>({category,count:counts.get(category)||0,rep_name:repName(category)}))};
}

/** Chat questions per logged outcome ('answered', 'no_rows', 'restricted', 'error'); outcomes with none are absent. */
export function questionOutcomes(scope:CustomerScope):Record<string,number>{
  const rows=all<{outcome:string;count:number}>(`SELECT outcome,count(*) count FROM query_logs WHERE ${QUESTIONS} GROUP BY outcome ORDER BY outcome`,bindScope(scope));
  return Object.fromEntries(rows.map(r=>[r.outcome,r.count]));
}

/** One row per quote with its send and response times and last sent total: turnaround, win rate, $ quoted vs accepted. */
export function quoteFacts(scope:CustomerScope):QuoteFact[]{
  return all<Omit<QuoteFact,'is_sample'>&{is_sample:number}>(`SELECT q.id,q.quote_number,q.customer_id,q.rep_id,q.status,q.is_sample,q.requested_at,
      (SELECT min(v.sent_at) FROM quote_revisions v WHERE v.quote_id=q.id) first_sent_at,(SELECT max(v.sent_at) FROM quote_revisions v WHERE v.quote_id=q.id) last_sent_at,q.responded_at,q.valid_until,
      (SELECT count(*) FROM quote_revisions v WHERE v.quote_id=q.id) revisions,(SELECT v.total FROM quote_revisions v WHERE v.quote_id=q.id ORDER BY v.revision DESC LIMIT 1) sent_total
    FROM quotes q WHERE q.customer_id IN (SELECT value FROM json_each(?)) ORDER BY q.requested_at,q.quote_number`,bindScope(scope)).map(row=>({...row,is_sample:bool(row.is_sample)}));
}

/** Internal: every quote line with its cost, Querent's suggestion and the floor for (quote rep x category): margin vs floor, GP Querent found. */
export function quoteLineFacts(scope:CustomerScope){
  return all<QuoteLineFact>(`SELECT l.quote_id,q.status,l.item_id,i.sku,i.category_id,l.qty,l.unit_price,l.price_basis,l.suggested_price,l.suggested_basis,l.customer_price,l.unit_cost,f.margin_floor,l.added_by
    FROM quote_lines l JOIN quotes q ON q.id=l.quote_id JOIN items i ON i.id=l.item_id LEFT JOIN rep_category_floors f ON f.rep_id=q.rep_id AND f.category_id=i.category_id
    WHERE q.customer_id IN (SELECT value FROM json_each(?)) ORDER BY q.requested_at,q.quote_number,l.line_no`,bindScope(scope));
}

/**
 * Internal: the lines of each quote's last sent revision (the snapshot the customer saw), with
 * each line's cost and the floor for (quote rep x category): margin vs floor. A quote the rep is
 * editing after a change request still reads as sent until it is sent again.
 */
export function sentLineFacts(scope:CustomerScope){
  return all<SentLineFact>(`SELECT q.id quote_id,v.revision,i.id item_id,i.sku,i.category_id,json_extract(l.value,'$.qty') qty,json_extract(l.value,'$.unit_price') unit_price,
      coalesce((SELECT d.unit_cost FROM quote_lines d WHERE d.quote_id=q.id AND d.item_id=i.id ORDER BY d.line_no LIMIT 1),i.cost) unit_cost,f.margin_floor
    FROM quotes q JOIN quote_revisions v ON v.quote_id=q.id AND v.revision=(SELECT max(r.revision) FROM quote_revisions r WHERE r.quote_id=q.id)
    JOIN json_each(v.snapshot,'$.lines') l JOIN items i ON i.sku=json_extract(l.value,'$.sku')
    LEFT JOIN rep_category_floors f ON f.rep_id=q.rep_id AND f.category_id=i.category_id
    WHERE q.customer_id IN (SELECT value FROM json_each(?)) ORDER BY q.requested_at,q.quote_number,l.key`,bindScope(scope));
}

/** Items on the most quotes (then the most qty). */
export function topRequestedItems(scope:CustomerScope,limit=10){
  return all<RequestedItem>(`SELECT l.item_id,i.sku,i.description,count(DISTINCT l.quote_id) quote_count,sum(l.qty) total_qty
    FROM quote_lines l JOIN quotes q ON q.id=l.quote_id JOIN items i ON i.id=l.item_id WHERE q.customer_id IN (SELECT value FROM json_each(?))
    GROUP BY l.item_id ORDER BY quote_count DESC,total_qty DESC,i.sku LIMIT ?`,bindScope(scope),limit);
}
