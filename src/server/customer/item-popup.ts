import 'server-only';
import type {ItemPopupContext} from '@/lib/contracts';
import {assignedRep,branches,catalogItem,deliveryAddress,enabledCategories,stockForItems} from '@/server/repository/customer';

// The item pop-up's live facts (spec §3, task 2.3). The pop-up's chat payload holds only SKUs, qty,
// and pickup/delivery with the branch (task 0.4 carry-forward): stock is read here, when the pop-up
// renders, so it is current for whichever branch the customer picks. Customer-facing, so it reads
// only the customer-safe repository module: no prices and no cost.
//
// Items & stock off (the customer's access toggle): stock is null for every item and stock_shown is
// false. The pop-up then says stock isn't shown and Request quote still works: the rep confirms
// availability on the quote. (A new pop-up can't open with the toggle off, since matching needs it;
// this covers one opened before the toggle changed. Task 2.3 default, flagged for review.)

/** The pop-up asks about at most this many SKUs (the chat's request limit is 20 lines). */
export const MAX_POPUP_SKUS=50;

/** Item identity for each SKU (in order, each once, unknown SKUs left out), stock per branch, the branches, the ship-to on file and the rep. */
export function itemPopupContext(customerId:string,skus:readonly string[]):ItemPopupContext{
  const stockShown=enabledCategories(customerId).has('items_stock');
  const wanted=skus.map(s=>s.trim()).filter(Boolean).slice(0,MAX_POPUP_SKUS);
  const items=[...new Map(wanted.flatMap(sku=>{const item=catalogItem(sku);return item?[[item.id,item] as const]:[];})).values()];
  const stock=new Map(stockShown?stockForItems(items.map(i=>i.id)).map(s=>[s.item_id,s.branches]):[]);
  return {
    items:items.map(item=>({
      sku:item.sku,description:item.description,pack:item.pack,
      stock:stockShown?(stock.get(item.id)??[]).map(b=>({branch_id:b.branch_id,available:b.available})):null,
    })),
    branches:branches().map(({id,code,name})=>({id,code,name})),
    stock_shown:stockShown,
    ship_to:deliveryAddress(customerId),
    rep_name:assignedRep(customerId)?.name??null,
  };
}
