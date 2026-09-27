// What Claude may read about a "Suggested by Querent" chip (spec §5.5, task 3.6). Claude only
// words the chips; the rules (task 1.6) decide them. This is LLM code (repository/boundary.test.ts):
// it may not import the upsell rules, pricing, floors or the quote service, and a chip reaches it
// only as these plain, cost-free facts. The rep service (src/server/rep/quote-upsells.ts) builds
// them and leaves out every unit cost, price, price basis, margin and GP figure a chip carries.

/** A chip's wording: its headline and a short why. */
export interface ChipWording {title:string;reason:string}

interface ChipBase {
  /** The chip's stable id (`${kind}:${sku}`), echoed back with its wording. */
  id:string;
  /** The item to add, or the item whose line is bumped. */
  item:{sku:string;description:string;pack:string};
  /** How many to add, or the line's new qty. */
  qty:number;
  /** The quote line that led to the chip. */
  anchor:{sku:string;description:string};
  /** History counts cover this many months up to the quote day. */
  history_months:number;
  /** Querent's template wording for the same facts: a correct starting point. */
  template:ChipWording;
}

/** A graded bolt on the quote -> the nut or washer of its size and grade. */
export interface FastenerChipFacts extends ChipBase {
  kind:'matching_fastener';
  part:'nut'|'washer';
  bolt:{diameter:string;thread:string;grade:string};
  /** Bolts on the quote (pieces) and pieces per pack of the part; null when a pack doesn't say. */
  bolt_pieces:number|null;pack_pieces:number|null;
  /** Orders in the window that had the bolt, and how many of them also had this part; null when too few. */
  history:{orders_together:number;anchor_orders:number}|null;
}

/** A line whose qty isn't a whole number of cases -> the next full case. */
export interface FullCaseChipFacts extends ChipBase {
  kind:'full_case';
  case_qty:number;from_qty:number;to_qty:number;cases:number;
}

/** An item the customer often buys on the same orders as a quote item. */
export interface BoughtTogetherChipFacts extends ChipBase {
  kind:'bought_together';
  /** Orders in the window that had the anchor item, and how many of them also had this item. */
  orders_together:number;anchor_orders:number;
}

export type ChipFacts=FastenerChipFacts|FullCaseChipFacts|BoughtTogetherChipFacts;

/**
 * Words chips from their facts: one entry per chip, in order; null (or a missing entry) keeps
 * that chip's template wording. May throw, and the caller then keeps every template.
 */
export type ChipWriter=(chips:readonly ChipFacts[])=>Promise<readonly (ChipWording|null)[]>;

/** Keys that would carry cost, price or profit. None may appear anywhere in what a writer is sent. */
export const COST_KEY=/cost|price|basis|gp|margin|profit|floor|amount|total/i;

/** Every key in `value`, at any depth, that looks like cost, price or profit (COST_KEY). */
export function costKeys(value:unknown,path=''):string[]{
  if(Array.isArray(value))return value.flatMap((v,i)=>costKeys(v,`${path}[${i}]`));
  if(value&&typeof value==='object')return Object.entries(value).flatMap(([key,v])=>[...(COST_KEY.test(key)?[`${path}.${key}`]:[]),...costKeys(v,`${path}.${key}`)]);
  return [];
}
