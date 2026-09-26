import {textContenders,type Purchase} from './score';
import type {MatchableItem} from './text';

// "The usual" (spec §3, task 1.4): what the customer means by "the usual gloves" is the glove they
// order most. scoreItems already weighs this in when a line says "the usual"; resolveUsual answers
// it directly, e.g. to prefill the qty from the last order.

export interface UsualItem<T> {item:T;order_count:number;last_order_date?:string;last_qty?:number}

/**
 * The item `phrase` means by "the usual": among the items its words match best (the contenders),
 * the one the customer has ordered most, the most recent first on a tie. Undefined when the
 * customer never ordered any of them, or the phrase names no item ("the usual" on its own).
 */
export function resolveUsual<T extends MatchableItem>(phrase:string,catalog:readonly T[],purchases:readonly Purchase[]):UsualItem<T>|undefined{
  const bySku=new Map(purchases.map(p=>[p.sku.toUpperCase(),p]));
  const bought=textContenders(phrase,catalog,purchases).flatMap(({item})=>{const p=bySku.get(item.sku.toUpperCase());return p&&p.order_count>0?[{item,p}]:[];});
  bought.sort((a,b)=>b.p.order_count-a.p.order_count||(b.p.last_order_date??'').localeCompare(a.p.last_order_date??''));
  const best=bought[0];
  if(!best)return undefined;
  const {order_count,last_order_date,last_qty}=best.p;
  return {item:best.item,order_count,...(last_order_date===undefined?{}:{last_order_date}),...(last_qty===undefined?{}:{last_qty})};
}
