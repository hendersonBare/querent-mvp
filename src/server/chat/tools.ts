import 'server-only';
import {FULFILLMENTS,type BranchStock,type CartLine,type Fulfillment,type ItemCandidate,type ItemPopupPayload} from '@/domain';
import type {Category} from '@/lib/contracts';
import {catalogMatches} from '@/server/matching';
import {branches,catalogItem,enabledCategories,stockForItems} from '@/server/repository/customer';

// The chat tools over the customer-safe repository (spec §6.3). Scripted chat calls these
// handlers directly, and live chat (task 2.1) exposes the same handlers to Claude, so both modes
// read the same data and enforce the same access rules. Each tool that answers an information
// category checks the customer's toggle here, server-side. No tool returns cost.

export interface ToolContext {customerId:string}

export type ToolResult<T>=
  |{ok:true;data:T}
  |{ok:false;reason:'restricted';category:Category}
  |{ok:false;reason:'invalid';message:string};

const invalid=(message:string):ToolResult<never>=>({ok:false,reason:'invalid',message});
const restricted=(ctx:ToolContext,category:Category):ToolResult<never>|undefined=>
  enabledCategories(ctx.customerId).has(category)?undefined:{ok:false,reason:'restricted',category};

/**
 * search_items: catalog candidates for a phrase, best first (up to `limit`, default 5). Identity
 * only (SKU, description, pack, category), so it needs no access toggle: a customer can always
 * name what they want to buy. Ranking and confidence are task 1.4's scorer.
 */
export function searchItemsTool(ctx:ToolContext,{query,limit=5}:{query:string;limit?:number}):ToolResult<ItemCandidate[]>{
  if(!query.trim())return invalid('Give search_items some words to search for.');
  return {ok:true,data:catalogMatches(ctx.customerId,query,{limit})};
}

export interface ItemStockAnswer {sku:string;description:string;pack:string;total_available:number;branches:BranchStock[]}

/** get_stock: stock at every branch for each SKU (Items & stock). Unknown SKUs come back in `unknown`. */
export function getStockTool(ctx:ToolContext,{skus}:{skus:string[]}):ToolResult<{items:ItemStockAnswer[];unknown:string[]}>{
  if(!skus.length)return invalid('Give get_stock at least one SKU.');
  const denied=restricted(ctx,'items_stock');
  if(denied)return denied;
  const found=skus.map(sku=>({sku,item:catalogItem(sku)}));
  const items=found.flatMap(({item})=>item?[item]:[]);
  const stock=new Map(stockForItems(items.map(i=>i.id)).map(s=>[s.item_id,s]));
  return {ok:true,data:{
    items:items.map(item=>{const s=stock.get(item.id);return {sku:item.sku,description:item.description,pack:item.pack,total_available:s?.total_available??0,branches:s?.branches??[]};}),
    unknown:found.filter(f=>!f.item).map(f=>f.sku),
  }};
}

export interface ProposeCartInput {lines:CartLine[];fulfillment?:Fulfillment;branch_id?:string}

/**
 * propose_cart: the item pop-up's contents (spec §3). Only a cart whose every line has a real SKU
 * and a whole qty is accepted, so the pop-up never opens on a guess. Repeated SKUs merge into one
 * line. Pickup at the first branch (SLC) unless told otherwise.
 */
export function proposeCartTool(_ctx:ToolContext,{lines,fulfillment='will_call',branch_id}:ProposeCartInput):ToolResult<ItemPopupPayload>{
  if(!lines.length)return invalid('A cart needs at least one line.');
  if(!(FULFILLMENTS as readonly string[]).includes(fulfillment))return invalid(`Fulfillment must be ${FULFILLMENTS.join(' or ')}.`);
  const all=branches();
  const branch=branch_id===undefined?all[0]:all.find(b=>b.id===branch_id);
  if(!branch)return invalid(`No branch has id ${branch_id}.`);
  const merged=new Map<string,CartLine>();
  for(const line of lines){
    const item=catalogItem(line.sku);
    if(!item)return invalid(`No catalog item has SKU ${line.sku}.`);
    if(!Number.isInteger(line.qty)||line.qty<1||line.qty>9999)return invalid(`Qty for ${item.sku} must be a whole number from 1 to 9999.`);
    const existing=merged.get(item.sku);
    if(existing)existing.qty+=line.qty;
    else merged.set(item.sku,{sku:item.sku,qty:line.qty,...(line.requested_text?{requested_text:line.requested_text}:{})});
  }
  const cartLines=[...merged.values()];
  const tooMany=cartLines.find(l=>l.qty>9999);
  if(tooMany)return invalid(`Qty for ${tooMany.sku} must be a whole number from 1 to 9999.`);
  return {ok:true,data:{fulfillment,branch_id:branch.id,lines:cartLines}};
}
