import 'server-only';
import type {Quote} from '@/domain';
import {priceLines,type PriceLinesRequest} from '@/server/pricing/service';
import {coPurchases,costedItems,lastPaidSince,purchasedItems,quote,stockForItems} from '@/server/repository';
import {suggestUpsells,type Upsell,type UpsellOptions,type UpsellPricer} from './rules';

// The thin database adapter for upsells (spec §5.5): it loads a quote's facts through the
// repository (catalog, the customer's last 12 months of orders, stock at the quote branch), prices
// each idea with the pricing engine (task 1.1, priceLines) and hands everything to the pure rules.
// Internal only: chips carry unit cost and GP, so they belong in the rep portal and never in a
// customer response. The wording is the template; Claude can reword it (wordUpsells), and that
// writer must run rep-side or be handed chips with cost and GP stripped (see UpsellWriter).

/**
 * Prices upsell ideas with task 1.1's priceLines for one quote's customer, rep, branch and day:
 * Querent's suggested price and basis, or null when the engine has nothing to suggest.
 */
export function pricerFor(request:Omit<PriceLinesRequest,'lines'>):UpsellPricer{
  return lines=>{
    const key=(itemId:string,qty:number)=>`${itemId}\u0000${qty}`;
    const priced=new Map(priceLines({...request,lines}).map(p=>[key(p.itemId,p.qty),p.suggestion]));
    return lines.map(({itemId,qty})=>{const s=priced.get(key(itemId,qty));return s&&s.price!==null?{price:s.price,basis:s.basis}:null;});
  };
}

export interface QuoteUpsellsOptions{
  /** The day to price on. History is the 12 months up to and including it (YYYY-MM-DD, default today UTC). */
  on?:string;
  options?:Partial<UpsellOptions>;
}

/**
 * The "Suggested by Querent" chips for a quote (spec §4, §5.5), best GP gain first. History is the
 * customer's orders over the same window as "last paid": from 12 months before `on` through `on`,
 * both inclusive, so orders dated after `on` never count. Stock is what's available at the quote's
 * branch. Pass the quote id, or a quote already loaded. undefined if there is no such quote.
 */
export function quoteUpsells(quoteOrId:string|Quote,{on=new Date().toISOString().slice(0,10),options}:QuoteUpsellsOptions={}):Upsell[]|undefined{
  const q=typeof quoteOrId==='string'?quote(quoteOrId):quoteOrId;
  if(!q)return undefined;
  const dates={since:lastPaidSince(on),until:on};
  const catalog=costedItems();
  const quoteItems=[...new Set(q.lines.map(l=>l.item_id))];
  const available=Object.fromEntries(stockForItems(catalog.map(i=>i.id)).map(s=>[s.item_id,s.branches.find(b=>b.branch_id===q.branch_id)?.available??0]));
  return suggestUpsells({
    lines:q.lines,catalog,available,options,
    purchased:purchasedItems(q.customer_id,dates),
    coPurchases:Object.fromEntries(quoteItems.map(itemId=>[itemId,coPurchases(q.customer_id,itemId,dates)])),
    price:pricerFor({customerId:q.customer_id,repId:q.rep_id,branchId:q.branch_id,on}),
  });
}
