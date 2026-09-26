import 'server-only';
import type {QuoteFact,QuoteLineFact,RequestedItem} from '@/domain';
import {categories,type Analytics,type Category} from '@/lib/contracts';
import {aggregateAccess} from './access';
import {customerIds} from './accounts';
import {all,bool} from './sql';

// Analytics reads (spec §4). `scope` is a customer id, or null for every customer.

/** Chat question counts per information category and the minutes they saved (the original query analytics). */
export function analytics(scope:string|null):Analytics{
  const logs=all<{handled_categories:string;outcome:string}>('SELECT handled_categories,outcome FROM query_logs WHERE ? IS NULL OR customer_id=?',scope,scope);
  const rules=aggregateAccess(scope?[scope]:customerIds());
  const counts=new Map(categories.map(c=>[c,0]));
  const base:Record<Category,number>={items_stock:8,pricing:10,orders_quotes:7,account:5};
  let minutes=0;
  for(const log of logs){
    const handled=JSON.parse(log.handled_categories) as Category[];
    handled.forEach(c=>counts.set(c,(counts.get(c)||0)+1));
    if(['answered','no_rows'].includes(log.outcome)&&handled.length)minutes+=Math.max(...handled.map(c=>base[c]));
  }
  return {total_queries:logs.length,minutes_saved:minutes,hours_saved:(minutes/60).toFixed(1),categories:categories.map(category=>({category,count:counts.get(category)||0,rep_name:rules.find(r=>r.category===category)?.rep_name||'Self-serve'}))};
}

/** One row per quote with its send and response times and last sent total: turnaround, win rate, $ quoted vs accepted. */
export function quoteFacts(scope:string|null):QuoteFact[]{
  return all<Omit<QuoteFact,'is_sample'>&{is_sample:number}>(`SELECT q.id,q.quote_number,q.customer_id,q.rep_id,q.status,q.is_sample,q.requested_at,
      (SELECT min(v.sent_at) FROM quote_revisions v WHERE v.quote_id=q.id) first_sent_at,(SELECT max(v.sent_at) FROM quote_revisions v WHERE v.quote_id=q.id) last_sent_at,q.responded_at,
      (SELECT count(*) FROM quote_revisions v WHERE v.quote_id=q.id) revisions,(SELECT v.total FROM quote_revisions v WHERE v.quote_id=q.id ORDER BY v.revision DESC LIMIT 1) sent_total
    FROM quotes q WHERE ? IS NULL OR q.customer_id=? ORDER BY q.requested_at,q.quote_number`,scope,scope).map(row=>({...row,is_sample:bool(row.is_sample)}));
}

/** Internal: every quote line with its cost and the floor for (quote rep x category): margin vs floor, GP Querent found. */
export function quoteLineFacts(scope:string|null){
  return all<QuoteLineFact>(`SELECT l.quote_id,q.status,l.item_id,i.sku,i.category_id,l.qty,l.unit_price,l.suggested_price,l.customer_price,l.unit_cost,f.margin_floor,l.added_by
    FROM quote_lines l JOIN quotes q ON q.id=l.quote_id JOIN items i ON i.id=l.item_id LEFT JOIN rep_category_floors f ON f.rep_id=q.rep_id AND f.category_id=i.category_id
    WHERE ? IS NULL OR q.customer_id=? ORDER BY q.requested_at,q.quote_number,l.line_no`,scope,scope);
}

/** Items on the most quotes (then the most qty). */
export function topRequestedItems(scope:string|null,limit=10){
  return all<RequestedItem>(`SELECT l.item_id,i.sku,i.description,count(DISTINCT l.quote_id) quote_count,sum(l.qty) total_qty
    FROM quote_lines l JOIN quotes q ON q.id=l.quote_id JOIN items i ON i.id=l.item_id WHERE ? IS NULL OR q.customer_id=?
    GROUP BY l.item_id ORDER BY quote_count DESC,total_qty DESC,i.sku LIMIT ?`,scope,scope,limit);
}
