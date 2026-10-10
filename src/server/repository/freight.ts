import 'server-only';
import type {FreightPool,PoolInputs} from '@/domain';
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
function poolWindow(now:string){
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
