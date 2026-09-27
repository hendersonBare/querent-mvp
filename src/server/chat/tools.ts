import 'server-only';
import {FULFILLMENTS,type BranchStock,type CartLine,type Fulfillment,type ItemCandidate,type ItemPopupPayload,type OrderStatus,type QuoteStatus} from '@/domain';
import type {Category} from '@/lib/contracts';
import {matchLine} from '@/server/matching';
import {
  accountSummary,branches,catalogItem,catalogItems,customerPrices,customerQuote,enabledCategories,orderHistory,orderStatus,purchasedItems,stockForItems,
} from '@/server/repository/customer';
import {splitRequest} from './lines';

// The chat tools over the customer-safe repository (spec §6.3). Scripted chat calls these handlers
// directly and live chat exposes the same handlers to Claude (./definitions.ts), so both modes read
// the same data and enforce the same access rules. No tool returns cost, margin or floors: they
// read only '@/server/repository/customer' (boundary.test.ts enforces it).
//
// Access (spec §6.3 "each tool checks the customer's access toggles"): every tool answers one
// information category and is refused, server-side, when the customer has it turned off. Asking
// for goods (search_items, propose_cart) counts as Items & stock: the pop-up shows stock, and a
// supplier that hides its catalog from chat hides item matching too; the customer is pointed to
// their rep. Inside a tool, order history backs "the usual" only with Orders & quotes on, and
// order history shows the unit prices paid only with Pricing on.

export const TOOL_NAMES=['search_items','get_stock','get_price','get_order_history','get_order_status','get_account_summary','propose_cart'] as const;
export type ToolName=typeof TOOL_NAMES[number];

/** The information category each tool answers, and so the toggle that gates it. */
export const TOOL_CATEGORY={
  search_items:'items_stock',
  get_stock:'items_stock',
  propose_cart:'items_stock',
  get_price:'pricing',
  get_order_history:'orders_quotes',
  get_order_status:'orders_quotes',
  get_account_summary:'account',
} as const satisfies Record<ToolName,Category>;

export interface ToolContext {
  customerId:string;
  /** The day prices are read for, YYYY-MM-DD. Defaults to today. */
  today?:string;
}

export type ToolResult<T>=
  |{ok:true;data:T}
  |{ok:false;reason:'restricted';category:Category}
  |{ok:false;reason:'invalid';message:string};

const invalid=(message:string):ToolResult<never>=>({ok:false,reason:'invalid',message});
const has=(ctx:ToolContext,category:Category)=>enabledCategories(ctx.customerId).has(category);

/** The refusal for a tool whose category the customer has turned off, or undefined when it may run. */
export function toolDenied(ctx:ToolContext,name:ToolName):ToolResult<never>|undefined{
  const category=TOOL_CATEGORY[name];
  return has(ctx,category)?undefined:{ok:false,reason:'restricted',category};
}

/** Wraps a tool so it is refused when the customer has its category turned off. No tool skips this. */
function gated<I,O>(name:ToolName,run:(ctx:ToolContext,input:I)=>ToolResult<O>){
  return (ctx:ToolContext,input:I):ToolResult<O>=>toolDenied(ctx,name)??run(ctx,input);
}

/** Looks up SKUs (ignoring case, each once): the items found, and the SKUs that match nothing. */
function lookUp(skus:readonly string[]){
  const wanted=[...new Set(skus.map(s=>s.trim()).filter(Boolean))];
  const found=wanted.map(sku=>({sku,item:catalogItem(sku)}));
  const items=[...new Map(found.flatMap(({item})=>item?[[item.id,item] as const]:[])).values()];
  return {items,unknown:found.filter(f=>!f.item).map(f=>f.sku)};
}
const clamp=(n:number|undefined,fallback:number,max:number)=>n!==undefined&&Number.isFinite(n)?Math.min(max,Math.max(1,Math.floor(n))):fallback;
const DAY=/^\d{4}-\d{2}-\d{2}$/;

// ---- search_items (Items & stock) --------------------------------------------------------------

/** A search_items candidate: identity plus its match score (0 to 1). */
export interface ScoredItemCandidate extends ItemCandidate {score:number}
/** One requested line: `confident` means candidates[0] is the match; otherwise ask `question`. */
export interface ItemSearchLine {requested_text:string;qty:number|null;candidates:ScoredItemCandidate[];confident:boolean;question:string|null}
export interface ItemSearchResult {lines:ItemSearchLine[]}

/** A request is split into at most this many lines. */
export const MAX_REQUEST_LINES=20;

/**
 * search_items: splits a request into lines ("10 boxes of 1/2 in grade 8 hex bolts and 6 boxes of
 * cut-off wheels" is two), takes each line's qty out, and scores the catalog against each line
 * (src/server/matching): a confident SKU, or the question to ask. Up to `limit` candidates per line
 * (default 5), best first. Identity only: no stock, prices or cost. Order history ("the usual",
 * Dana's usual bolt length) is used only when the customer has Orders & quotes on.
 */
export const searchItemsTool=gated('search_items',(ctx,{query,limit}:{query:string;limit?:number}):ToolResult<ItemSearchResult>=>{
  if(!query.trim())return invalid('Give search_items some words to search for.');
  const requested=splitRequest(query).slice(0,MAX_REQUEST_LINES);
  if(!requested.length)return invalid('Say what the item is, not just how many: e.g. "1/2 in grade 8 hex bolts".');
  const purchases=has(ctx,'orders_quotes')?purchasedItems(ctx.customerId):[];
  const catalog=catalogItems();
  const rows=clamp(limit,5,20);
  return {ok:true,data:{lines:requested.map(line=>{
    const {candidates,confident,question}=matchLine(line.text,catalog,{purchases,limit:rows});
    return {
      requested_text:line.said,qty:line.qty,confident,question,
      candidates:candidates.map(({item:{sku,description,pack,category_name},score})=>({sku,description,pack,category_name,score})),
    };
  })}};
});

// ---- get_stock (Items & stock) -----------------------------------------------------------------

export interface ItemStockAnswer {sku:string;description:string;pack:string;total_available:number;branches:BranchStock[]}

/** get_stock: stock at every branch for each SKU. Unknown SKUs come back in `unknown`. */
export const getStockTool=gated('get_stock',(_ctx,{skus}:{skus:string[]}):ToolResult<{items:ItemStockAnswer[];unknown:string[]}>=>{
  if(!skus.length)return invalid('Give get_stock at least one SKU.');
  const {items,unknown}=lookUp(skus);
  const stock=new Map(stockForItems(items.map(i=>i.id)).map(s=>[s.item_id,s]));
  return {ok:true,data:{
    items:items.map(item=>{const s=stock.get(item.id);return {sku:item.sku,description:item.description,pack:item.pack,total_available:s?.total_available??0,branches:s?.branches??[]};}),
    unknown,
  }};
});

// ---- get_price (Pricing) -----------------------------------------------------------------------

/**
 * What the customer pays per pack. `your_price` is the active contract price, else the customer's
 * price-level price, else list. Customer-visible prices only: never cost, margin or Querent's
 * suggestion for a quote (the rep prices quotes).
 */
export interface PriceAnswer {
  sku:string;description:string;pack:string;list_price:number;customer_price:number|null;
  contract:{contract_number:string;contract_name:string;unit_price:number;ends_on:string}|null;
  your_price:number;price_basis:'contract'|'customer'|'list';
}

/** get_price: the customer's prices today for each SKU, from repository/customer's customerPrices. */
export const getPriceTool=gated('get_price',(ctx,{skus}:{skus:string[]}):ToolResult<{items:PriceAnswer[];unknown:string[]}>=>{
  if(!skus.length)return invalid('Give get_price at least one SKU.');
  const {items,unknown}=lookUp(skus);
  const prices=new Map(customerPrices(ctx.customerId,items.map(i=>i.id),ctx.today).map(p=>[p.item_id,p]));
  return {ok:true,data:{
    items:items.flatMap(item=>{
      const p=prices.get(item.id);
      if(!p)return [];
      const contract=p.contract&&{contract_number:p.contract.contract_number,contract_name:p.contract.contract_name,unit_price:p.contract.unit_price,ends_on:p.contract.ends_on};
      const [your_price,price_basis]=contract?[contract.unit_price,'contract' as const]:p.customer_price!==null?[p.customer_price,'customer' as const]:[p.list_price,'list' as const];
      return [{sku:item.sku,description:item.description,pack:item.pack,list_price:p.list_price,customer_price:p.customer_price,contract,your_price,price_basis}];
    }),
    unknown,
  }};
});

// ---- get_order_history (Orders & quotes) -------------------------------------------------------

/** One purchased line. unit_price is there only when the customer also has Pricing on. */
export interface HistoryLine {order_number:string;order_date:string;po_number:string|null;sku:string;description:string;pack:string;qty:number;unit_price?:number}

/** get_order_history: what the customer bought, newest first, optionally for some SKUs and since a day. */
export const getOrderHistoryTool=gated('get_order_history',(ctx,{skus,since,limit}:{skus?:string[];since?:string;limit?:number}):ToolResult<{lines:HistoryLine[];unknown:string[];prices_shown:boolean}>=>{
  if(since!==undefined&&!DAY.test(since))return invalid('`since` must be a day as YYYY-MM-DD.');
  const {items,unknown}=skus?.length?lookUp(skus):{items:undefined,unknown:[]};
  const prices_shown=has(ctx,'pricing');
  const rows=items&&!items.length?[]:orderHistory(ctx.customerId,{itemIds:items?.map(i=>i.id),since,limit:clamp(limit,20,50)});
  return {ok:true,data:{
    lines:rows.map(({item_id:_,unit_price,...line})=>prices_shown?{...line,unit_price}:line),
    unknown,prices_shown,
  }};
});

// ---- get_order_status (Orders & quotes) --------------------------------------------------------

export interface OrderStatusAnswer {
  order_number:string;po_number:string|null;order_date:string;status:OrderStatus;fulfillment:Fulfillment;branch_code:string;
  shipped_on:string|null;tracking_number:string|null;subtotal:number;freight:number;tax:number;total:number;quote_number:string|null;
}
/** A quote's status as the customer sees it: the total is the last one the rep sent (null before the first send). */
export interface QuoteStatusAnswer {quote_number:string;status:QuoteStatus;revision:number;requested_at:string;sent_at:string|null;valid_until:string|null;total:number|null}

const QUOTE_NUMBER=/^Q-?(\d{3,})$/i;

/**
 * get_order_status: one order by order number or PO number, or the latest order when no reference
 * is given; a quote number ("Q-24817") gives that quote's status. Nothing found: both are null.
 */
export const getOrderStatusTool=gated('get_order_status',(ctx,{reference}:{reference?:string}):ToolResult<{reference:string|null;order:OrderStatusAnswer|null;quote:QuoteStatusAnswer|null}>=>{
  const ref=reference?.trim()||null;
  const quoteNumber=ref?QUOTE_NUMBER.exec(ref)?.[1]:undefined;
  if(quoteNumber!==undefined){
    const q=customerQuote(ctx.customerId,`Q-${quoteNumber}`);
    const quote=q?{quote_number:q.quote_number,status:q.status,revision:q.revision,requested_at:q.requested_at,sent_at:q.sent_at,valid_until:q.valid_until,total:q.total}:null;
    return {ok:true,data:{reference:ref,order:null,quote}};
  }
  const found=orderStatus(ctx.customerId,ref??undefined);
  const order=found?(({id:_,branch_id:__,...rest})=>rest)(found):null;
  return {ok:true,data:{reference:ref,order,quote:null}};
});

// ---- get_account_summary (Account) -------------------------------------------------------------

export interface AccountAnswer {
  account_number:string;name:string;terms:string|null;credit_limit:number|null;open_balance:number|null;past_due_balance:number|null;
  available_credit:number|null;tax_status:'taxable'|'exempt'|null;rep:{name:string;title:string;phone:string;email:string}|null;
}

/** get_account_summary: terms, credit limit, balances, tax status and the assigned rep. */
export const getAccountSummaryTool=gated('get_account_summary',(ctx,_input:Record<string,never>):ToolResult<AccountAnswer>=>{
  const a=accountSummary(ctx.customerId);
  if(!a)return invalid('No account found.');
  const available_credit=a.credit_limit!==null&&a.open_balance!==null?Math.round((a.credit_limit-a.open_balance)*100)/100:null;
  return {ok:true,data:{
    account_number:a.account_number,name:a.name,terms:a.terms,credit_limit:a.credit_limit,open_balance:a.open_balance,past_due_balance:a.past_due_balance,
    available_credit,tax_status:a.tax_status,rep:a.rep&&{name:a.rep.name,title:a.rep.title,phone:a.rep.phone,email:a.rep.email},
  }};
});

// ---- propose_cart (Items & stock) --------------------------------------------------------------

export interface ProposeCartInput {lines:CartLine[];fulfillment?:Fulfillment;branch_id?:string}

/**
 * propose_cart: the item pop-up's contents (spec §3). Only a cart whose every line has a real SKU
 * and a whole qty is accepted, so the pop-up never opens on a guess. Repeated SKUs merge into one
 * line. Pickup at the first branch (SLC) unless told otherwise.
 */
export const proposeCartTool=gated('propose_cart',(_ctx,{lines,fulfillment='will_call',branch_id}:ProposeCartInput):ToolResult<ItemPopupPayload>=>{
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
});
