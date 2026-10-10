import 'server-only';
import type {FuelStatus} from '@/domain';
import {toCents} from '@/lib/money';
import {modelFuelPriceCents} from './cost-model';
import {freightCostSettings,markFuelPriceFetched,saveFuelPrice,storedFuelPrice} from '@/server/repository';

// The fuel price the delivery cost model uses (v3 spec §4.3, decision 30; task C3).
//
// Gasoline: OilPriceAPI (https://api.oilpriceapi.com/v1, header `Authorization: Token <key>`, NOT
// Bearer), code GASOLINE_RETAIL_STATE_<ST>_USD for the delivering branch's state. The HTTP source is
// built only when OILPRICEAPI_KEY is set; tests inject a fake source or a fake fetch and never call
// the real API. The key is read here, server-side only: it is never logged, never stored, never put
// in an error message, a status or any response.
//
// Daily cache: fuel_prices.fetched_on holds the UTC day of the last fetch attempt per state, so a
// state is fetched at most once a day, lazily, when a price is needed (quote creation and draft
// repricing through freight/quote.ts, and Pricing & delivery's load). No scheduler. A failure (or
// no key) keeps the last stored price; a state with nothing stored is not retried the same day.
// Status: a manual price (freight_fuel_manual_cents) always wins; otherwise the stored price, with a
// warning once its as_of is more than 14 days old; nothing stored means a manual price is required
// and fuel is 0 (OA-26). A warning shows whenever the price in use is missing or zero.
// TODO(R-9): diesel has no confirmed state price at OilPriceAPI, so diesel never calls the API: it
// is the manual price, or $0 when none is set.
// TODO(R-2): read OILPRICEAPI_KEY from user secrets or a secrets manager instead of .env.local.

export const OILPRICEAPI_BASE='https://api.oilpriceapi.com/v1';
/** A stored price older than this many whole days gets a warning on Pricing & delivery. */
export const STALE_AFTER_DAYS=14;
const DAY_MS=86_400_000;
const STATE=/^[A-Z]{2}$/;

export const NO_FUEL_PRICE='No fuel price. Enter one by hand.';
export const ZERO_FUEL_PRICE='The fuel price in use is $0.00, so deliveries are modelled with no fuel cost.';
export const staleFuelPrice=(days:number)=>`Fuel price is ${days} days old.`;

/** A state's retail gasoline price: cents per gallon, and when it was true. */
export interface FuelPriceQuote {cents:number;asOf:string}
/** Where gasoline prices come from: OilPriceAPI in production, a fake in tests. */
export interface FuelPriceSource {gasoline(state:string):Promise<FuelPriceQuote>}

/** A fuel price that couldn't be had. Its message never carries the key or the upstream's text. */
export class FuelPriceError extends Error{constructor(message:string){super(message);this.name='FuelPriceError';}}

/** The fetch the OilPriceAPI source uses (global fetch by default, a fake in tests). */
export type FetchLike=(url:string,init:{headers:Record<string,string>;signal?:AbortSignal})=>Promise<{ok:boolean;status:number;json():Promise<unknown>}>;

/** "GASOLINE_RETAIL_STATE_CA_USD" for CA. */
export const gasolineCode=(state:string)=>`GASOLINE_RETAIL_STATE_${state}_USD`;

const isRecord=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);

/**
 * The OilPriceAPI source: GET /prices/latest?by_code=GASOLINE_RETAIL_STATE_<ST>_USD with
 * `Authorization: Token <key>`. The answer's price (dollars a gallon) becomes cents; its as_of (or
 * created_at) is when it was true. Anything unexpected is a FuelPriceError naming only the status.
 */
export function oilPriceApiSource(key:string,fetchImpl:FetchLike=(url,init)=>fetch(url,init)):FuelPriceSource{
  return {async gasoline(state){
    if(!STATE.test(state))throw new FuelPriceError('A fuel price needs a two-letter state code.');
    const code=gasolineCode(state);
    let response:Awaited<ReturnType<FetchLike>>;
    try{response=await fetchImpl(`${OILPRICEAPI_BASE}/prices/latest?by_code=${code}`,{headers:{Authorization:`Token ${key}`,Accept:'application/json'},signal:AbortSignal.timeout(10_000)});}
    // The upstream error is dropped on purpose: its text could echo the request.
    catch{throw new FuelPriceError('OilPriceAPI could not be reached.');}
    if(!response.ok)throw new FuelPriceError(`OilPriceAPI answered ${response.status}.`);
    const body=await response.json().catch(()=>null);
    const data=isRecord(body)&&isRecord(body.data)?body.data:null;
    const price=data?.price,asOf=typeof data?.as_of==='string'?data.as_of:data?.created_at;
    if(!data||data.code!==code||typeof price!=='number'||!Number.isFinite(price)||price<0||typeof asOf!=='string'||Number.isNaN(Date.parse(asOf)))
      throw new FuelPriceError('OilPriceAPI sent no usable gasoline price.');
    return {cents:toCents(price),asOf};
  }};
}

/** The OilPriceAPI source when OILPRICEAPI_KEY is set (server-side env only), else null: no key, no fetch. */
export function configuredFuelPriceSource(env:Record<string,string|undefined>=process.env):FuelPriceSource|null{
  const key=env.OILPRICEAPI_KEY?.trim();
  return key?oilPriceApiSource(key):null;
}

export type RefreshResult='fetched'|'fresh'|'failed'|'skipped';

// The UTC day of the last attempt for a state with nothing stored (no row to mark), and fetches in
// flight, so calls that arrive together share one request. Per server process.
const attemptedWithoutRow=new Map<string,string>();
const inFlight=new Map<string,Promise<RefreshResult>>();

/**
 * Refreshes the state's gasoline price if it is needed and not yet fetched today (UTC): skipped when
 * a manual price is set, for diesel (TODO(R-9)), or with no source (no key); 'fresh' when today's
 * attempt already happened. Never throws: a failure keeps the last stored price ('failed').
 */
export async function refreshFuelPrice(state:string,{source=configuredFuelPriceSource(),now=new Date().toISOString()}:{source?:FuelPriceSource|null;now?:string}={}):Promise<RefreshResult>{
  const settings=freightCostSettings();
  if(settings.fuelManualCents!==null||settings.fuelType!=='gasoline'||!source)return 'skipped';
  const day=new Date(now).toISOString().slice(0,10);
  const flightKey=`${state}:${day}`;
  const pending=inFlight.get(flightKey);
  if(pending)return pending;
  const stored=storedFuelPrice(state,'gasoline');
  if(stored?.fetched_on===day||(!stored&&attemptedWithoutRow.get(state)===day))return 'fresh';
  const attempt=(async():Promise<RefreshResult>=>{
    try{
      const quote=await source.gasoline(state);
      saveFuelPrice({state,fuel:'gasoline',price_cents:quote.cents,as_of:quote.asOf,source:'api',fetched_on:day});
      return 'fetched';
    }catch{
      if(!markFuelPriceFetched(state,'gasoline',day))attemptedWithoutRow.set(state,day);
      return 'failed';
    }finally{inFlight.delete(flightKey);}
  })();
  inFlight.set(flightKey,attempt);
  return attempt;
}

/** The fuel price the cost model uses for `state` now, where it came from, its age and the warnings (see the header). Synchronous: reads the store only. */
export function fuelPriceStatus(state:string,now=new Date().toISOString()):FuelStatus{
  const {fuelType,fuelManualCents}=freightCostSettings();
  const stored=fuelManualCents===null&&fuelType==='gasoline'?storedFuelPrice(state,'gasoline'):undefined;
  // The cost model's precedence (cost-model.ts): manual, else gasoline's stored price, else 0.
  const cents=modelFuelPriceCents({fuelType,manualCents:fuelManualCents,gasolineCents:stored?.price_cents??null});
  const zero=cents===0?[ZERO_FUEL_PRICE]:[];
  if(fuelManualCents!==null)return {state,fuelType,cents,source:'manual',asOf:null,ageDays:null,warnings:zero};
  if(!stored)return {state,fuelType,cents,source:'none',asOf:null,ageDays:null,warnings:[NO_FUEL_PRICE]};
  const ageDays=Math.max(0,Math.floor((Date.parse(now)-Date.parse(stored.as_of))/DAY_MS));
  return {state,fuelType,cents,source:stored.source,asOf:stored.as_of,ageDays,warnings:[...(ageDays>STALE_AFTER_DAYS?[staleFuelPrice(ageDays)]:[]),...zero]};
}
