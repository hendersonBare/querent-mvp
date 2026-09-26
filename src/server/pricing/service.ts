import 'server-only';
import {floorFor,priceSources,pricingSettings,stockForItems} from '@/server/repository';
import {priceLine,type PricedLine} from './index';

// The thin adapter between the repository and the pure pricing engine (spec §5.1): it loads the
// facts for a set of lines (price sources, stock, the scarcity setting, the quote rep's floors)
// and prices each line. Internal only: the result carries cost-based margin.

export interface PriceLinesRequest{
  customerId:string;
  /** The quote's rep (always the customer's assigned rep); their floors drive the below-floor flag. */
  repId:string;
  /** The quote's branch, for scarcity. */
  branchId:string;
  lines:readonly {itemId:string;qty:number}[];
  /** The pricing day (YYYY-MM-DD, default today UTC). */
  on?:string;
}

export interface PricedItemLine extends PricedLine{itemId:string;sku:string;qty:number}

/** Prices each line in order. Unknown items are skipped; an item on two lines is priced by each line's qty. */
export function priceLines({customerId,repId,branchId,lines,on=new Date().toISOString().slice(0,10)}:PriceLinesRequest):PricedItemLine[]{
  if(!lines.length)return [];
  const itemIds=[...new Set(lines.map(l=>l.itemId))];
  const sources=new Map(priceSources(customerId,itemIds,on).map(s=>[s.item_id,s]));
  const stock=new Map(stockForItems(itemIds).map(s=>[s.item_id,s]));
  const floors=new Map<string,number|null>();
  const floor=(categoryId:string)=>{
    if(!floors.has(categoryId))floors.set(categoryId,floorFor(repId,categoryId)??null);
    return floors.get(categoryId)!;
  };
  const scarcityEnabled=pricingSettings().scarcity_uplift_enabled;
  return lines.flatMap(({itemId,qty})=>{
    const facts=sources.get(itemId);
    if(!facts)return [];
    return [{itemId,sku:facts.sku,qty,...priceLine({sources:facts,qty,branchId,stock:stock.get(itemId)??null,scarcityEnabled,floor:floor(facts.category_id),on})}];
  });
}
