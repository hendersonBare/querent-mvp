import 'server-only';
import type {FreightPool,FuelPriceRow,FuelType,PoolInputs,PriceBasis,Fulfillment} from '@/domain';
import {toCents} from '@/lib/money';
import {POOL_DEFAULTS,poolRate} from '../freight/pool';
import {all,inTransaction,nowIso,one,run,scalar} from './sql';

// Free delivery pricing's percentage pool (spec §4.4, decision 31). Internal: modelled cost and the
// pool never reach a customer (spec §4.6).
//
// Eligible quote: accepted, delivery, carries recovery (freight_rate_bp NOT NULL: free delivery was
// on, no freight override, not under the threshold), accepted (responded_at) within the trailing 90
// days of now (OA-17), both ends inclusive.

const ELIGIBLE=`q.status='accepted' AND q.fulfillment='delivery' AND q.freight_rate_bp IS NOT NULL AND q.responded_at>=@from AND q.responded_at<=@to`;

/** The window [now − 90 days, now] as ISO times. */
export function poolWindow(now:string){
  const to=new Date(now);
  if(Number.isNaN(to.getTime()))throw new RangeError(`Not an ISO time: ${now}`);
  return {from:new Date(to.getTime()-POOL_DEFAULTS.windowDays*86_400_000).toISOString(),to:to.toISOString()};
}

/**
 * Σ modelled_freight_cents, Σ goods_cents and the count over the eligible quotes. Goods are the
 * non-contract priced lines' unit_price × qty (OA-16, OA-25: unit_price, before any recovery). SQL
 * picks and groups the lines by unit price; each price becomes cents through the shared money helper,
 * so the sum is exact integer cents and matches the allocation's unit_price_cents (C2).
 */
export function poolInputs(now=nowIso()):PoolInputs{
  const window=poolWindow(now);
  const totals=one<{modelled:number;count:number}>(`SELECT coalesce(sum(q.modelled_freight_cents),0) modelled,count(*) count FROM quotes q WHERE ${ELIGIBLE}`,window)!;
  const prices=all<{unit_price:number;qty:number}>(`SELECT l.unit_price,sum(l.qty) qty FROM quote_lines l JOIN quotes q ON q.id=l.quote_id
    WHERE ${ELIGIBLE} AND l.unit_price IS NOT NULL AND l.qty>0 AND l.price_basis IS NOT 'contract' GROUP BY l.unit_price`,window);
  return {modelledCents:totals.modelled,goodsCents:prices.reduce((sum,p)=>sum+toCents(p.unit_price)*p.qty,0),count:totals.count};
}

const KEYS={rate:'freight_pool_rate_bp',on:'freight_pool_on',count:'freight_pool_count',day:'freight_pool_computed_on'} as const;
const read=(key:string)=>scalar<string>('SELECT value FROM settings WHERE key=?',key);
const write=(key:string,value:string)=>run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,value);

/**
 * The pool, recomputed lazily at most once per UTC day of `now` and cached in the freight_pool_*
 * settings (freight_pool_computed_on holds the day). No rate is stored when there is nothing to divide.
 */
export function cachedPoolRate(now=nowIso()):FreightPool{
  const day=poolWindow(now).to.slice(0,10);
  return inTransaction(()=>{
    if(read(KEYS.day)===day){
      const rate=read(KEYS.rate);
      return {rateBp:rate===undefined?null:Number(rate),on:read(KEYS.on)==='true',count:Number(read(KEYS.count)??0),computedOn:day};
    }
    const inputs=poolInputs(now),rateBp=poolRate(inputs),on=inputs.count>=POOL_DEFAULTS.minPoolCount;
    if(rateBp===null)run('DELETE FROM settings WHERE key=?',KEYS.rate);else write(KEYS.rate,String(rateBp));
    write(KEYS.on,String(on));write(KEYS.count,String(inputs.count));write(KEYS.day,day);
    return {rateBp,on,count:inputs.count,computedOn:day};
  });
}

/** What the eligible quotes of the trailing 90 days recovered in item prices: Σ freight_recovery × qty, in cents (Pricing & delivery's pool panel, spec §4.6). */
export function poolRecoveredCents(now=nowIso()){
  return scalar<number>(`SELECT coalesce(sum(l.freight_recovery*l.qty),0) FROM quote_lines l JOIN quotes q ON q.id=l.quote_id WHERE ${ELIGIBLE}`,poolWindow(now))??0;
}

// ---- The impact preview's quotes (spec §4.7) ----

/** A line of a preview quote: price, cost, basis and the item's product category. Internal (cost). */
export interface PreviewLineRow {line_no:number;qty:number;unit_price:number|null;unit_cost:number;price_basis:PriceBasis|null;category_id:string;category_name:string;category_order:number}
/** A delivery quote the impact preview weighs: its route, override and lines. */
export interface PreviewQuoteRow {id:string;fulfillment:Fulfillment;branch_id:string;ship_to_address:string|null;ship_to_lat:number|null;ship_to_lng:number|null;freight_override:number|null;lines:PreviewLineRow[]}

const PREVIEW_QUOTES=`q.fulfillment='delivery' AND q.created_at>=@from AND q.created_at<=@to`;

/** Every delivery quote created in the trailing 90 days of `now` (both ends inclusive), any status, with its lines in order. */
export function previewQuotes(now=nowIso()):PreviewQuoteRow[]{
  const window=poolWindow(now);
  const quotes=all<Omit<PreviewQuoteRow,'lines'>>(`SELECT q.id,q.fulfillment,q.branch_id,q.ship_to_address,q.ship_to_lat,q.ship_to_lng,q.freight_override FROM quotes q
    WHERE ${PREVIEW_QUOTES} ORDER BY q.created_at,q.id`,window);
  const lines=all<PreviewLineRow&{quote_id:string}>(`SELECT l.quote_id,l.line_no,l.qty,l.unit_price,l.unit_cost,l.price_basis,c.id category_id,c.name category_name,c.sort_order category_order
    FROM quote_lines l JOIN quotes q ON q.id=l.quote_id JOIN items i ON i.id=l.item_id JOIN product_categories c ON c.id=i.category_id
    WHERE ${PREVIEW_QUOTES} ORDER BY l.quote_id,l.line_no`,window);
  const byQuote=new Map<string,PreviewLineRow[]>();
  for(const {quote_id,...line} of lines)byQuote.set(quote_id,[...(byQuote.get(quote_id)??[]),line]);
  return quotes.map(q=>({...q,lines:byQuote.get(q.id)??[]}));
}

// ---- Fuel prices (fuel_prices, 008; spec §4.3). One row per state and fuel. ----

const FUEL='SELECT state,fuel,price_cents,as_of,source,fetched_on FROM fuel_prices';

/** The stored price for a state and fuel, or undefined when none was ever stored. */
export function storedFuelPrice(state:string,fuel:FuelType){return one<FuelPriceRow>(`${FUEL} WHERE state=? AND fuel=?`,state,fuel);}

/** Stores (replaces) the price for its state and fuel. */
export function saveFuelPrice(row:FuelPriceRow){
  if(!Number.isInteger(row.price_cents)||row.price_cents<0)throw new RangeError(`A fuel price must be whole cents of at least 0 (got ${row.price_cents}).`);
  run(`INSERT INTO fuel_prices(state,fuel,price_cents,as_of,source,fetched_on) VALUES(@state,@fuel,@price_cents,@as_of,@source,@fetched_on)
    ON CONFLICT(state,fuel) DO UPDATE SET price_cents=excluded.price_cents,as_of=excluded.as_of,source=excluded.source,fetched_on=excluded.fetched_on`,row);
}

/** Records a fetch attempt on `day` (a failed one keeps the price and its as_of). Returns false when there is no row. */
export function markFuelPriceFetched(state:string,fuel:FuelType,day:string){
  return run('UPDATE fuel_prices SET fetched_on=? WHERE state=? AND fuel=?',day,state,fuel).changes===1;
}
