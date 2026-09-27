import 'server-only';
import type {PriceBasis,QuoteLine} from '@/domain';
import {lineFloorStatus} from '@/server/floors';
import {priceLines,type PricedItemLine} from '@/server/pricing/service';
import {sendBlockers} from '@/server/quotes/send-check';
import {cents} from '@/server/quotes/snapshot';
import {accountSummary,costedItem,quoteNotes,repFloors} from '@/server/repository';
import type {PdfLine} from './model';
import {repPdfContext,repPdfSource} from './rep';
import type {PdfRevision} from './request';
import {worksheetModel,type WorksheetLineFacts,type WorksheetModel} from './worksheet';

// The internal worksheet's data (task 4.2, spec §6.7). REP-ONLY: it reads cost, margin, floors and
// Querent's reasoning. The route serves it to the supplier persona only; the customer's path
// (src/app/api/quotes/[id]/pdf/customer.ts) can't reach it (./boundary.test.ts).
//
// What it prints starts from the same revision or draft as the rep's customer PDF (./rep):
// - rev=draft: the live draft. Each line's cost, basis and price are the quote line's.
// - a sent revision: its frozen snapshot for everything the customer saw (qty, prices, totals,
//   terms, letterhead), so the worksheet agrees with the PDF the customer has. The snapshot holds
//   no cost (by design), so cost is the unit cost stored on the quote's line with the same SKU,
//   which was copied from the item when the line was written. A line removed from the quote since
//   falls back to the item's current cost, marked in the PDF. Why this price? and last paid are
//   recomputed with the pricing day set to the send date: last paid and the contracts active then
//   follow it, but list and customer prices are today's (the database keeps no history of them).
//   (Default for task 4.2, flagged for review.)
// In both, the price basis options, Querent's pick and "Why this price?" come from the pricing
// engine (priceLines) and margin and floors from lineFloorStatus, as on the quote screen (3.3).
// Floors, credit and internal notes are live; the PDF says as of when.

export type InternalPdf={ok:true;model:WorksheetModel}|{ok:false;status:404|409;detail:string};

/** For a sent revision: the quote line each printed line came from, by SKU and in order, or undefined if it is gone. */
export function matchSentLines(sent:readonly Pick<PdfLine,'sku'>[],stored:readonly QuoteLine[]):(QuoteLine|undefined)[]{
  const pool=[...stored];
  return sent.map(line=>{
    const i=pool.findIndex(s=>s.sku===line.sku);
    return i<0?undefined:pool.splice(i,1)[0];
  });
}

/**
 * The basis a price was set on: the quote line's own when it still carries that price; otherwise
 * the first basis option with that exact price (Contract, Customer, List, Last paid), else Custom.
 */
export function basisFor(price:number|null,stored:Pick<QuoteLine,'unit_price'|'price_basis'>|undefined,priced:Pick<PricedItemLine,'options'>|undefined):PriceBasis|null{
  if(price===null)return null;
  if(stored&&stored.unit_price!==null&&cents(stored.unit_price)===cents(price))return stored.price_basis;
  return priced?.options.find(o=>o.basis!=='custom'&&o.price!==null&&cents(o.price)===cents(price))?.basis??'custom';
}

/**
 * The internal worksheet of one of `repId`'s quotes: rev n, the latest sent (rev null), or the
 * draft. Another rep's quote is not found (repPdfSource), so no rep sees a colleague's cost.
 */
export async function internalWorksheet(repId:string,quoteIdOrNumber:string,rev:PdfRevision,{now=new Date().toISOString()}:{now?:string}={}):Promise<InternalPdf>{
  const loaded=await repPdfSource(repId,quoteIdOrNumber,rev,now);
  if(!loaded.ok)return loaded;
  const {quote:q,source,freight}=loaded;

  // fromDraft prints the draft's lines in order, so line i is q.lines[i].
  const stored=source.draft?q.lines:matchSentLines(source.lines,q.lines);
  const items=source.lines.map((line,i)=>{
    const own=stored[i];
    const item=own?undefined:costedItem(line.sku);
    return {own,itemId:own?.item_id??item?.id??null,unit_cost:own?.unit_cost??item?.cost??null,cost_source:own?'quote' as const:item?'item' as const:null,
      category_id:own?.category_id??item?.category_id??null,category_name:own?.category_name??item?.category_name??null};
  });

  // The pricing engine skips unknown items, so walk its answers in order.
  const pricedOn=(source.draft?now:source.date).slice(0,10);
  const priced=priceLines({customerId:q.customer_id,repId:q.rep_id,branchId:q.branch_id,on:pricedOn,
    lines:items.flatMap((item,i)=>item.itemId?[{itemId:item.itemId,qty:source.lines[i].qty}]:[])});
  let next=0;
  const pricing=items.map(item=>item.itemId&&priced[next]?.itemId===item.itemId?priced[next++]:undefined);

  const floors={repId:q.rep_id,repName:q.rep_name,floors:repFloors(q.rep_id)};
  const lines=source.lines.map((line,i):WorksheetLineFacts=>{
    const item=items[i],p=pricing[i];
    const lastPaid=p?.options.find(o=>o.basis==='last_paid');
    return {unit_cost:item.unit_cost,cost_source:item.cost_source,category_name:item.category_name,
      basis:basisFor(line.unit_price,item.own,p),
      querent:p?{basis:p.suggestion.basis,price:p.suggestion.price}:null,
      last_paid:lastPaid?.price!=null&&lastPaid.note?{price:lastPaid.price,date:lastPaid.note}:null,
      why:p?.explanation??null,
      floor:item.unit_cost!==null&&item.category_id?lineFloorStatus({unit_price:line.unit_price,unit_cost:item.unit_cost,category_id:item.category_id,category_name:item.category_name??item.category_id},floors):null};
  });

  const account=accountSummary(q.customer_id);
  return {ok:true,model:worksheetModel(source,repPdfContext(q,source),{
    asOf:now,lines,
    account:account?{terms:account.terms,credit_limit:account.credit_limit,open_balance:account.open_balance,past_due_balance:account.past_due_balance}:null,
    notes:quoteNotes(q.id),
    blockers:freight?sendBlockers(q,freight).map(b=>b.message):null,
  })};
}
