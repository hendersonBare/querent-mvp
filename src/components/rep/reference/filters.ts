import type {CustomerDirectoryRow,Fulfillment,OrderListRow,OrderStatus} from '@/domain';
import type {ItemRow} from '@/server/rep/reference';
import {count,money} from './format';

// The filters of the Customers, Orders and Stock lists (plan U5; C_CU1 and C_CU2, C_RCU1, C_OR1,
// C_ST1). Pure: the lists filter the rows the server read for the signed-in rep (already scoped by
// role, task U1), and the tests call these directly. A filter group with nothing picked keeps every
// row; groups combine with AND, the boxes inside a group with OR, and Only show rules with AND.

/** A typed amount: "$5,000.00", "5000" or "1250.5"; null when empty or not a number. */
export function parseMoney(text:string):number|null{
  const cleaned=text.replace(/[$,\s]/g,'');
  if(!cleaned)return null;
  const value=Number(cleaned);
  return Number.isFinite(value)?value:null;
}

const contains=(text:string,query:string)=>text.toLowerCase().includes(query);
const inRange=(value:number|null,from:string,to:string)=>{
  const low=parseMoney(from),high=parseMoney(to);
  if(low===null&&high===null)return true;
  if(value===null)return false;
  return (low===null||value>=low)&&(high===null||value<=high);
};
/** "Open balance: $0.00 to $5,000.00", "...: from $1,000.00", "...: up to $5,000.00", or null with no bound. */
function rangeChip(label:string,from:string,to:string){
  const low=parseMoney(from),high=parseMoney(to);
  if(low===null&&high===null)return null;
  if(low!==null&&high!==null)return `${label}: ${money(low)} to ${money(high)}`;
  return low!==null?`${label}: from ${money(low)}`:`${label}: up to ${money(high)}`;
}

/** One applied filter group as C_CU2 draws it ("Rep: Brandi Gallegos, Eli Porter"), with its group to clear. */
export interface FilterChip<G extends string=string> {group:G;label:string}

// ---- Customers ----

export type CustomerOnly='open_quotes'|'over_credit'|'never_ordered';
export const CUSTOMER_ONLY:readonly {value:CustomerOnly;label:string}[]=[
  {value:'open_quotes',label:'Has open quotes'},{value:'over_credit',label:'Over 80% of credit limit'},{value:'never_ordered',label:'Never ordered'},
];
export interface CustomerFilters {reps:string[];terms:string[];balanceFrom:string;balanceTo:string;only:CustomerOnly[]}
export const NO_CUSTOMER_FILTERS:CustomerFilters={reps:[],terms:[],balanceFrom:'',balanceTo:'',only:[]};

/** A customer with no terms and no credit on file (a placeholder, spec §2) reads "Not on file". */
export const NOT_ON_FILE='Not on file';
type CustomerRow=CustomerDirectoryRow;
export const onFile=(row:Pick<CustomerRow,'terms'|'credit_limit'>)=>row.terms!==null||row.credit_limit!==null;
const termsOf=(row:CustomerRow)=>onFile(row)?row.terms:NOT_ON_FILE;
/** "Over 80% of credit limit": the open balance is more than 80% of a credit limit on file. */
export const OVER_CREDIT_SHARE=0.8;
const overCredit=(row:CustomerRow)=>!!row.credit_limit&&(row.open_balance??0)/row.credit_limit>OVER_CREDIT_SHARE;

export interface RepOption {id:string;name:string;count:number}
/** The reps who have customers in the list, by name, each with how many (C_CU1). */
export function customerRepOptions(rows:readonly CustomerRow[]):RepOption[]{
  const reps=new Map<string,RepOption>();
  for(const row of rows){
    if(!row.rep_id||!row.rep_name)continue;
    const rep=reps.get(row.rep_id)??{id:row.rep_id,name:row.rep_name,count:0};
    rep.count++;
    reps.set(row.rep_id,rep);
  }
  return [...reps.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
/** The terms on file, in order, then Not on file when a customer has none (C_CU1 "Net 30, Net 45, Not on file"). */
export function customerTermsOptions(rows:readonly CustomerRow[]):string[]{
  const terms=[...new Set(rows.filter(onFile).flatMap(r=>r.terms?[r.terms]:[]))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  return rows.some(r=>!onFile(r))?[...terms,NOT_ON_FILE]:terms;
}

export function filterCustomers<R extends CustomerRow>(rows:readonly R[],f:CustomerFilters):R[]{
  return rows.filter(row=>(!f.reps.length||(row.rep_id!==null&&f.reps.includes(row.rep_id)))
    &&(!f.terms.length||f.terms.includes(termsOf(row)??''))
    &&inRange(row.open_balance,f.balanceFrom,f.balanceTo)
    &&(!f.only.includes('open_quotes')||row.open_quote_count>0)
    &&(!f.only.includes('over_credit')||overCredit(row))
    &&(!f.only.includes('never_ordered')||row.order_count===0));
}
/** The search box: name or account number, ignoring case. */
export function searchCustomers<R extends CustomerRow>(rows:readonly R[],query:string):R[]{
  const q=query.trim().toLowerCase();
  return q?rows.filter(r=>contains(r.name,q)||contains(r.account_number,q)):[...rows];
}

export type CustomerGroup='reps'|'terms'|'balance'|'only';
export function customerChips(f:CustomerFilters,reps:readonly {id:string;name:string}[]):FilterChip<CustomerGroup>[]{
  const chips:FilterChip<CustomerGroup>[]=[];
  if(f.reps.length)chips.push({group:'reps',label:`Rep: ${f.reps.map(id=>reps.find(r=>r.id===id)?.name??id).join(', ')}`});
  if(f.terms.length)chips.push({group:'terms',label:`Terms: ${f.terms.join(', ')}`});
  const balance=rangeChip('Open balance',f.balanceFrom,f.balanceTo);
  if(balance)chips.push({group:'balance',label:balance});
  if(f.only.length)chips.push({group:'only',label:`Only show: ${CUSTOMER_ONLY.filter(o=>f.only.includes(o.value)).map(o=>o.label).join(', ')}`});
  return chips;
}
export function clearCustomerGroup(f:CustomerFilters,group:CustomerGroup):CustomerFilters{
  if(group==='balance')return {...f,balanceFrom:'',balanceTo:''};
  return {...f,[group]:[]};
}

// ---- Orders ----

export interface OrderFilters {reps:string[];statuses:OrderStatus[];fulfillment:Fulfillment[];branches:string[];from:string;to:string}
export const NO_ORDER_FILTERS:OrderFilters={reps:[],statuses:[],fulfillment:[],branches:[],from:'',to:''};
export const FULFILLMENT_OPTIONS:readonly {value:Fulfillment;label:string}[]=[{value:'delivery',label:'Delivery'},{value:'will_call',label:'Will call'}];
const STATUS_ORDER:readonly OrderStatus[]=['open','shipped','closed'];

/** The reps whose customers have orders in the list, by name (C_OR1). */
export function orderRepOptions(rows:readonly OrderListRow[]):{id:string;name:string}[]{
  const reps=new Map<string,string>();
  for(const row of rows)if(row.rep_id&&row.rep_name)reps.set(row.rep_id,row.rep_name);
  return [...reps].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name));
}
/** The statuses the orders have, in the ERP's order (C_OR1: Shipped, Closed). */
export const orderStatusOptions=(rows:readonly OrderListRow[])=>STATUS_ORDER.filter(s=>rows.some(r=>r.status===s));

export function filterOrders<R extends OrderListRow>(rows:readonly R[],f:OrderFilters):R[]{
  return rows.filter(row=>(!f.reps.length||(row.rep_id!==null&&f.reps.includes(row.rep_id)))
    &&(!f.statuses.length||f.statuses.includes(row.status))
    &&(!f.fulfillment.length||f.fulfillment.includes(row.fulfillment))
    &&(!f.branches.length||f.branches.includes(row.branch_id))
    &&(!f.from||row.order_date>=f.from)&&(!f.to||row.order_date<=f.to));
}
/** How many groups are applied: the Filter button's badge (no chip row: C_OR1 draws no applied state). */
export const orderFilterCount=(f:OrderFilters)=>[f.reps,f.statuses,f.fulfillment,f.branches].filter(g=>g.length).length+(f.from||f.to?1:0);

// ---- Stock ----

export type StockOnly='low_stock'|'on_order';
export const STOCK_ONLY:readonly {value:StockOnly;label:string}[]=[{value:'low_stock',label:'Low stock'},{value:'on_order',label:'On order'}];
export interface StockFilters {categories:string[];branches:string[];only:StockOnly[];priceFrom:string;priceTo:string}
export const NO_STOCK_FILTERS:StockFilters={categories:[],branches:[],only:[],priceFrom:'',priceTo:''};

/**
 * "Low stock": some branch has less than one full case (case_qty packs) on hand. No spec or frame
 * defines it; this is the open assumption listed in docs/plans/status.md ("No frame", to ask).
 */
export const isLowStock=(item:Pick<ItemRow,'stock'|'case_qty'>)=>item.stock.some(s=>s.available<item.case_qty);
const onOrder=(item:Pick<ItemRow,'stock'>)=>item.stock.some(s=>s.on_order>0);

export function filterItems<R extends ItemRow>(items:readonly R[],f:StockFilters):R[]{
  return items.filter(item=>(!f.categories.length||f.categories.includes(item.category_id))
    &&(!f.branches.length||item.stock.some(s=>f.branches.includes(s.branch_id)&&s.available>0))
    &&(!f.only.includes('low_stock')||isLowStock(item))
    &&(!f.only.includes('on_order')||onOrder(item))
    &&inRange(item.list_price,f.priceFrom,f.priceTo));
}
/** The search box: SKU or item name, ignoring case. */
export function searchItems<R extends ItemRow>(items:readonly R[],query:string):R[]{
  const q=query.trim().toLowerCase();
  return q?items.filter(i=>contains(i.sku,q)||contains(i.description,q)):[...items];
}
export const stockFilterCount=(f:StockFilters)=>[f.categories,f.branches,f.only].filter(g=>g.length).length+(parseMoney(f.priceFrom)!==null||parseMoney(f.priceTo)!==null?1:0);
/** C_ST1's line under the title: "62 items across 6 categories." */
export const stockSummary=(items:number,categories:number)=>`${count(items,'item')} across ${count(categories,'category','categories')}.`;
