import 'server-only';
import type {DeliveryRates,Quote} from '@/domain';
import {resolveFloor,type FloorRow} from '@/server/floors';
import type {DistanceProvider} from '@/server/freight/distance';
import type {QuoteFreight} from '@/server/freight/engine';
import {repriceQuoteRecovery} from '@/server/freight/quote';
import {canEditDraft,effectiveStatus,validUntilOnSend} from '@/server/quotes';
import {sendCheck,type SendCheck} from '@/server/quotes/service';
import {contact,deliveryRates,pricingSettings,priceSources,quote as loadQuote,repFloors,stockForItems} from '@/server/repository';
import type {DetailLine} from './quote-math';
import {quotePanels,type QuotePanels} from './quote-panels';
import {repQuote} from './quotes';

// The rep's quote detail (spec §4, task 3.3): GET /api/rep/quotes/<id> and the /rep/quotes/<id>
// page. Rep-only: it carries cost, margin, floors and every price fact, so only the supplier
// persona gets it (another rep's quote reads as not found, as in the Quotes list).
//
// Each line ships with its pricing facts (priceSources, stock, the scarcity setting, the rep's
// floor for its category, the pricing day), so the page can re-run the pricing engine and the
// floor rules as the rep types (./quote-math) and show exactly what a save will store.
//
// Free delivery pricing (spec §4.5): opening a draft, and every edit, reprices its freight recovery
// first (repriceQuoteRecovery), so a draft whose frozen state disagrees with the toggle reprices on
// its next open or edit. Sent and final quotes are never repriced.

const clock=()=>new Date().toISOString();

export interface QuoteDetail {
  /** When the detail was read: statuses are effective as of this instant. */
  as_of:string;
  /** The quote header. `status` is effective (a sent quote past valid_until reads as expired). */
  quote:Omit<Quote,'lines'>&{contact_title:string|null};
  /** While editable, the day it would run to if sent today (the rep's expiration date, else send day + valid_days); after that, the valid_until it went out with. */
  valid_until:string;
  /** The rep can change the draft (spec §5.4: ready_for_review or changes_requested). */
  editable:boolean;
  lines:DetailLine[];
  /** The quote rep's floors (spec §5.2): the red warnings and the blended floor marker. */
  floors:FloorRow[];
  /** Freight as saved (task 1.3). The page re-prices distance freight live on its subtotal. */
  freight:QuoteFreight;
  delivery_rates:DeliveryRates;
  /** sendCheck (task 1.5) on the saved draft: what blocks Approve & send, and the floor count. */
  send_check:Pick<SendCheck,'can_send'|'status_problem'|'blockers'|'below_floor_count'|'subtotal'|'total'|'revision'>;
  /** The side panels (task 3.4): customer and credit, branches, internal notes, Activity. */
  panels:QuotePanels;
}

export interface QuoteDetailOptions {now?:string;provider?:DistanceProvider}

/** The pricing day for a read at `now` (UTC), as priceLines uses by default. */
export const pricingDay=(now:string)=>now.slice(0,10);

/** Each line of `q` with its pricing facts, in line order. */
export function detailLines(q:Quote,now:string):DetailLine[]{
  const itemIds=[...new Set(q.lines.map(l=>l.item_id))];
  const on=pricingDay(now);
  const sources=new Map(priceSources(q.customer_id,itemIds,on).map(s=>[s.item_id,s]));
  const stock=new Map(stockForItems(itemIds).map(s=>[s.item_id,s]));
  const floors=repFloors(q.rep_id);
  const scarcityEnabled=pricingSettings().scarcity_uplift_enabled;
  return q.lines.map(line=>{
    const facts=sources.get(line.item_id);
    return {...line,pricing:facts?{sources:facts,branchId:q.branch_id,stock:stock.get(line.item_id)??null,scarcityEnabled,
      floor:resolveFloor(floors,q.rep_id,facts.category_id).floor,on}:null};
  });
}

/** The detail for a quote already loaded and checked as the rep's. */
export async function quoteDetailOf(q:Quote,{now=clock(),provider}:QuoteDetailOptions={}):Promise<QuoteDetail>{
  const status=effectiveStatus(q,now);
  const check=await sendCheck(q.id,{provider,now});
  const {lines:_lines,...header}=q;
  const quote:QuoteDetail['quote']={...header,status,contact_title:q.contact_id?contact(q.contact_id)?.title??null:null};
  const editable=canEditDraft(status);
  return {as_of:now,quote,valid_until:editable||!q.valid_until?validUntilOnSend(q,now):q.valid_until,editable,lines:detailLines(q,now),
    floors:repFloors(q.rep_id).map(({rep_id,category_id,margin_floor})=>({rep_id,category_id,margin_floor})),
    freight:check.freight,delivery_rates:deliveryRates(),
    send_check:{can_send:check.can_send,status_problem:check.status_problem,blockers:check.blockers,below_floor_count:check.below_floor_count,
      subtotal:check.subtotal,total:check.total,revision:check.revision},
    panels:quotePanels(q,now)};
}

/**
 * The detail after an edit or on an open: the draft's freight recovery repriced first (a no-op for
 * sent and final quotes), then read fresh. `remodel` measures the modelled delivery cost again, for
 * an edit that changed the fulfillment, branch or ship-to.
 */
export async function repricedDetail(quoteId:string,{remodel=false,...options}:QuoteDetailOptions&{remodel?:boolean}={}):Promise<QuoteDetail>{
  await repriceQuoteRecovery(quoteId,{now:options.now,provider:options.provider,remodel});
  return quoteDetailOf(loadQuote(quoteId)!,options);
}

/** One of the rep's quotes, by id or number, with everything the detail page needs; undefined if it isn't theirs. */
export async function repQuoteDetail(repId:string,quoteIdOrNumber:string,options:QuoteDetailOptions={}):Promise<QuoteDetail|undefined>{
  const q=repQuote(repId,quoteIdOrNumber);
  return q&&repricedDetail(q.id,options);
}
