import 'server-only';
import type {Contract,ContractPrice,CustomerPrice,LastPaid,PriceSources} from '@/domain';
import {addDays} from '../db/seed/dates';
import {all,inOrder,list,one,today} from './sql';

// Price facts per customer x item (spec §5.1). This module only reads facts; the pricing
// engine (task 1.1) decides the suggestion. `on` is the pricing day (YYYY-MM-DD, default today).

/** "Last paid" looks back 12 months from the pricing day (spec §5.1). */
export const LAST_PAID_WINDOW_DAYS=365;

/** The customer's contracts, newest first, each with its lines and whether it is active on `on`. */
export function contracts(customerId:string,on=today()):Contract[]{
  const rows=all<Omit<Contract,'active'|'lines'>>('SELECT id,customer_id,contract_number,name,starts_on,ends_on FROM contracts WHERE customer_id=? ORDER BY ends_on DESC,contract_number',customerId);
  const lines=all<Contract['lines'][number]&{contract_id:string}>('SELECT l.contract_id,l.item_id,i.sku,i.description,l.unit_price FROM contract_lines l JOIN items i ON i.id=l.item_id JOIN contracts c ON c.id=l.contract_id WHERE c.customer_id=? ORDER BY i.sku',customerId);
  return rows.map(c=>({...c,active:c.starts_on<=on&&on<=c.ends_on,lines:lines.filter(l=>l.contract_id===c.id).map(({contract_id:_,...line})=>line)}));
}

/**
 * Prices the customer may see for each item (the get_price tool): list price, their price-level
 * price, and the active contract price. If two active contracts cover an item, the lower price wins.
 * Unknown items are skipped; results follow the order of `itemIds`.
 */
export function customerPrices(customerId:string,itemIds:readonly string[],on=today()):CustomerPrice[]{
  if(!itemIds.length)return [];
  const rows=all<Omit<CustomerPrice,'contract'>>(`SELECT i.id item_id,i.sku,i.list_price,p.unit_price customer_price FROM items i
    LEFT JOIN customers cu ON cu.id=? LEFT JOIN customer_prices p ON p.price_level_id=cu.price_level_id AND p.item_id=i.id
    WHERE i.id IN (SELECT value FROM json_each(?))`,customerId,list(itemIds));
  const contractRows=all<ContractPrice&{item_id:string}>(`SELECT l.item_id,c.id contract_id,c.contract_number,c.name contract_name,l.unit_price,c.starts_on,c.ends_on
    FROM contract_lines l JOIN contracts c ON c.id=l.contract_id
    WHERE c.customer_id=? AND c.starts_on<=? AND c.ends_on>=? AND l.item_id IN (SELECT value FROM json_each(?))
    ORDER BY l.unit_price,c.starts_on DESC`,customerId,on,on,list(itemIds));
  const contract=new Map<string,ContractPrice>();
  for(const {item_id,...price} of contractRows)if(!contract.has(item_id))contract.set(item_id,price);
  return inOrder(itemIds,rows.map(r=>({...r,contract:contract.get(r.item_id)??null})),r=>r.item_id);
}

/** The most recent price the customer paid for an item on orders dated since..until (inclusive). */
export function lastPaid(customerId:string,itemId:string,{since,until=today()}:{since:string;until?:string}){
  return one<LastPaid>(`SELECT l.unit_price,l.qty,o.order_date,o.order_number FROM order_lines l JOIN orders o ON o.id=l.order_id
    WHERE o.customer_id=? AND l.item_id=? AND o.order_date>=? AND o.order_date<=? ORDER BY o.order_date DESC,o.order_number DESC,l.line_no LIMIT 1`,customerId,itemId,since,until);
}

/**
 * Internal: every price fact the pricing engine needs per item: the customer-visible prices,
 * plus cost, case qty, category and last paid in the 12 months up to `on`. Never send to a customer.
 */
export function priceSources(customerId:string,itemIds:readonly string[],on=today()):PriceSources[]{
  const prices=customerPrices(customerId,itemIds,on);
  if(!prices.length)return [];
  const facts=new Map(all<{item_id:string;cost:number;case_qty:number;category_id:string}>('SELECT id item_id,cost,case_qty,category_id FROM items WHERE id IN (SELECT value FROM json_each(?))',list(itemIds)).map(f=>[f.item_id,f]));
  const paid=new Map(all<LastPaid&{item_id:string}>(`SELECT item_id,unit_price,qty,order_date,order_number FROM (
      SELECT l.item_id,l.unit_price,l.qty,o.order_date,o.order_number,row_number() OVER (PARTITION BY l.item_id ORDER BY o.order_date DESC,o.order_number DESC,l.line_no) n
      FROM order_lines l JOIN orders o ON o.id=l.order_id
      WHERE o.customer_id=? AND o.order_date>=? AND o.order_date<=? AND l.item_id IN (SELECT value FROM json_each(?))
    ) WHERE n=1`,customerId,addDays(on,-LAST_PAID_WINDOW_DAYS),on,list(itemIds)).map(({item_id,...last})=>[item_id,last]));
  return prices.map(p=>{const {cost,case_qty,category_id}=facts.get(p.item_id)!;return {...p,cost,case_qty,category_id,last_paid:paid.get(p.item_id)??null};});
}
