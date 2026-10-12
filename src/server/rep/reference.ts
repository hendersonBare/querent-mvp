import 'server-only';
import {cookies} from 'next/headers';
import type {
  BranchStock,CatalogItem,Contact,CustomerAccount,CustomerDirectoryRow,CustomerListItem,CustomerOrder,ItemSale,OrderListRow,ProductCategory,QuoteStatus,
} from '@/domain';
import {CUSTOMER_PARAM,customerFilter} from '@/components/rep/scope';
import {effectiveStatus} from '@/server/quotes';
import {expireOverdueQuotes} from '@/server/quotes/service';
import {
  allOrders,branches,catalogItem,catalogItems,contacts,customerAccount,customerDirectory,customers,customerStats,findOrder,itemSales,productCategories,quotes,stockForItems,
} from '@/server/repository';
import {COOKIE,principalFromCookie} from '@/server/session';
import {customerFilterFor,ownerFilter,readsCustomer,repAccess,type RepReader} from './access';

// The rep portal's reference views (spec §4 "Customers / Orders / Items: read-only list and detail
// views", task 3.8). Each function gathers what one page shows from the repository. None of them
// returns cost or margin: the spec and mockup show those on quotes only.
//
// Whose records (Appendix B; task U1): a rep reads only their own customers, those customers'
// orders and their own quotes; the manager reads the whole organization. A page's own ?customer=
// filter narrows further: the Customers list to that customer, Orders and an item's recent sales to
// its orders. A customer the reader can't read is ignored like an unknown one. The catalog is the
// same for everyone.

type SearchParams=Record<string,string|string[]|undefined>;
const clock=()=>new Date().toISOString();

// ---- The page's own customer filter ----

export interface PickedCustomer {
  /** The filtered customer's id, or null for All customers (an unknown id, or one the reader can't read, reads as All customers). */
  customerId:string|null;
  customer:CustomerListItem|null;
  /** "All customers" or the customer's name. */
  label:string;
}

/** A page's ?customer= filter from its searchParams, kept only when the reader may read that customer (task U1). */
export function pickedCustomer(params:SearchParams,reader:RepReader):PickedCustomer{
  const value=params[CUSTOMER_PARAM];
  const customer=customerFilterFor(reader,customerFilter({get:()=>typeof value==='string'?value:null}),customers());
  return {customerId:customer?.id??null,customer,label:customer?.name??'All customers'};
}

/**
 * A detail page's title: the record's name for the signed-in rep, and the section name for anyone
 * else. Metadata renders beside the page, so it checks the session itself rather than leaking a
 * name while the page redirects; `name` gets the reader, so a record the rep can't read (another
 * rep's customer or order, task U1) leaks no name either.
 */
export async function detailTitle(section:string,name:(reader:RepReader)=>string|undefined):Promise<string>{
  const access=repAccess(principalFromCookie((await cookies()).get(COOKIE)?.value));
  if(!access.ok)return section;
  return name(access)??section;
}

// ---- Customers ----

/** The Customers list: the reader's customers by name (every customer for the manager), or just the filtered one. */
export function customerList(reader:RepReader,customerId:string|null=null):CustomerDirectoryRow[]{
  return customerDirectory({repId:ownerFilter(reader)}).filter(c=>customerId===null||c.id===customerId);
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
 * Everything the customer page shows, or undefined when there is no such customer or the reader
 * can't read it (another rep's customer, task U1). The recent quotes are the reader's own (every
 * rep's for the manager). Expiry is lazy (task 1.5), so this stores the expiry of the customer's
 * overdue sent quotes first; statuses and the win rate then agree with the Quotes list.
 */
export function customerDetail(customerId:string,reader:RepReader,{now=clock()}:{now?:string}={}):CustomerDetail|undefined{
  if(!readsCustomer(reader,customerId))return undefined;
  const account=customerAccount(customerId);
  if(!account)return undefined;
  expireOverdueQuotes({customerId,now});
  const stats=customerStats(customerId);
  const orderRows=allOrders({customerId});
  const quoteRows=quotes({customerId,repId:ownerFilter(reader)});
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

/** One item (by id or SKU) with stock per branch and its recent sales to the reader's customers (every customer for the manager), or the filtered customer's. */
export function itemDetail(idOrSku:string,reader:RepReader,{customerId=null}:{customerId?:string|null}={}):ItemDetail|undefined{
  const item=catalogItem(idOrSku);
  if(!item)return undefined;
  return {item:withStock([item])[0],branches:branches().map(({id,code,name})=>({id,code,name})),sales:itemSales(item.id,{customerId,repId:ownerFilter(reader)})};
}

// ---- Orders ----

/** The Orders list: the reader's customers' orders (every order for the manager), newest first, or the filtered customer's. */
export const orderList=(reader:RepReader,customerId:string|null=null)=>allOrders({customerId,repId:ownerFilter(reader)});

/** One order by id or number, or undefined when there is none or it is for a customer the reader can't read (task U1). */
export function orderDetail(orderIdOrNumber:string,reader:RepReader):CustomerOrder|undefined{
  const order=findOrder(orderIdOrNumber);
  return order&&readsCustomer(reader,order.customer_id)?order:undefined;
}
