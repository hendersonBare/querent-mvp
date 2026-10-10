import 'server-only';
import {cookies} from 'next/headers';
import type {
  BranchStock,CatalogItem,Contact,CustomerAccount,CustomerDirectoryRow,CustomerListItem,ItemSale,OrderListRow,ProductCategory,QuoteStatus,
} from '@/domain';
import {scopeFrom} from '@/components/rep/scope';
import {effectiveStatus} from '@/server/quotes';
import {expireOverdueQuotes} from '@/server/quotes/service';
import {
  allOrders,branches,catalogItem,catalogItems,contacts,customerAccount,customerDirectory,customers,customerStats,itemSales,productCategories,quotes,stockForItems,
} from '@/server/repository';
import {COOKIE,principalFromCookie} from '@/server/session';
import {repAccess} from './access';

// The rep portal's reference views (spec §4 "Customers / Orders / Items: read-only list and detail
// views", task 3.8). Each function gathers what one page shows from the repository. None of them
// returns cost or margin: the spec and mockup show those on quotes only.
//
// The "Viewing" picker (?customer=) scopes them: the Customers list narrows to the picked customer,
// Orders and an item's recent sales cover only its orders. The catalog is the same for everyone.

type SearchParams=Record<string,string|string[]|undefined>;
const clock=()=>new Date().toISOString();

// ---- The picker ----

export interface PickedCustomer {
  /** The picked customer's id, or null for All customers (an unknown id reads as All customers, as in the shell). */
  customerId:string|null;
  customer:CustomerListItem|null;
  /** "All customers" or the customer's name. */
  label:string;
}

/** The "Viewing" picker's customer from a page's searchParams, checked against the customer list like the shell does. */
export function pickedCustomer(params:SearchParams):PickedCustomer{
  const list=customers();
  const customerId=scopeFrom({get:name=>{const value=params[name];return typeof value==='string'?value:null;}},list);
  const customer=list.find(c=>c.id===customerId)??null;
  return {customerId,customer,label:customer?.name??'All customers'};
}

/**
 * A detail page's title: the record's name for the signed-in rep, and the section name for anyone
 * else. Metadata renders beside the page, so it checks the session itself rather than leaking a
 * name while the page redirects.
 */
export async function detailTitle(section:string,name:()=>string|undefined):Promise<string>{
  if(!repAccess(principalFromCookie((await cookies()).get(COOKIE)?.value)).ok)return section;
  return name()??section;
}

// ---- Customers ----

/** The Customers list: every customer by name, or just the picked one. */
export function customerList(customerId:string|null=null):CustomerDirectoryRow[]{
  return customerDirectory().filter(c=>customerId===null||c.id===customerId);
}

/** One of the customer's quotes as the customer page lists it: no cost or margin. */
export interface CustomerQuoteRow {
  id:string;quote_number:string;revision:number;
  /** The status to show now (a sent quote past valid_until reads as expired). */
  status:QuoteStatus;
  requested_at:string;
  /** The last sent revision's total, or null before the first send. */
  sent_total:number|null;
  rep_name:string;line_count:number;
}

export interface CustomerDetail {
  account:CustomerAccount;
  /** Placeholder customers carry only a name, account number and rep (spec §2). */
  on_file:boolean;
  /** open_balance / credit_limit, or null without a limit. */
  credit_used:number|null;
  contacts:Contact[];
  /** accepted / (accepted + lost: expired or declined), after the expiry sweep; null with nothing decided. */
  win_rate:number|null;quotes_won:number;quotes_decided:number;
  orders:{count:number;recent:OrderListRow[]};
  quotes:{count:number;recent:CustomerQuoteRow[]};
}

/** How many orders and quotes the customer page lists before "View all". */
export const RECENT=5;

/**
 * Everything the customer page shows. Expiry is lazy (task 1.5), so this stores the expiry of the
 * customer's overdue sent quotes first; statuses and the win rate then agree with the Quotes list.
 */
export function customerDetail(customerId:string,{now=clock()}:{now?:string}={}):CustomerDetail|undefined{
  const account=customerAccount(customerId);
  if(!account)return undefined;
  expireOverdueQuotes({customerId,now});
  const stats=customerStats(customerId);
  const orderRows=allOrders({customerId});
  const quoteRows=quotes({customerId});
  return {
    account,
    on_file:account.terms!==null||account.credit_limit!==null||account.open_balance!==null,
    credit_used:account.credit_limit?(account.open_balance??0)/account.credit_limit:null,
    contacts:contacts(customerId),
    win_rate:stats.win_rate,quotes_won:stats.quotes_accepted,quotes_decided:stats.quotes_accepted+stats.quotes_lost,
    orders:{count:orderRows.length,recent:orderRows.slice(0,RECENT)},
    quotes:{count:quoteRows.length,recent:quoteRows.slice(0,RECENT).map(q=>({id:q.id,quote_number:q.quote_number,revision:q.revision,status:effectiveStatus(q,now),
      requested_at:q.requested_at,sent_total:q.sent_total,rep_name:q.rep_name,line_count:q.line_count}))},
  };
}

// ---- Items ----

/** A catalog item with its stock at every branch, in branch order (SLC, Ogden, Provo). */
export interface ItemRow extends Omit<CatalogItem,'keywords'> {stock:BranchStock[];total_available:number}

export interface ItemList {
  /** The branches, in the order of each row's stock. */
  branches:{id:string;code:string}[];
  categories:(ProductCategory&{count:number})[];
  /** The category shown, or null for every category. */
  category:ProductCategory|null;
  items:ItemRow[];
}

function withStock(items:CatalogItem[]):ItemRow[]{
  const stock=new Map(stockForItems(items.map(i=>i.id)).map(s=>[s.item_id,s]));
  return items.map(({keywords:_k,...item})=>({...item,stock:stock.get(item.id)?.branches??[],total_available:stock.get(item.id)?.total_available??0}));
}

/** The catalog in category order with stock per branch, optionally one category (an unknown one reads as every category). */
export function itemList({category=null}:{category?:string|null}={}):ItemList{
  const all=catalogItems();
  const categories=productCategories().map(c=>({...c,count:all.filter(i=>i.category_id===c.id).length}));
  const picked=categories.find(c=>c.id===category)??null;
  return {
    branches:branches().map(({id,code})=>({id,code})),
    categories,
    category:picked&&{id:picked.id,name:picked.name,sort_order:picked.sort_order},
    items:withStock(picked?all.filter(i=>i.category_id===picked.id):all),
  };
}

export interface ItemDetail {item:ItemRow;branches:{id:string;code:string;name:string}[];sales:ItemSale[]}

/** One item (by id or SKU) with stock per branch and its recent sales, the picked customer's only when one is picked. */
export function itemDetail(idOrSku:string,{customerId=null}:{customerId?:string|null}={}):ItemDetail|undefined{
  const item=catalogItem(idOrSku);
  if(!item)return undefined;
  return {item:withStock([item])[0],branches:branches().map(({id,code,name})=>({id,code,name})),sales:itemSales(item.id,{customerId})};
}
