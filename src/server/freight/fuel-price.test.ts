// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest';
import {setSettingFixture,useSeededDatabase} from '@/server/repository/test-db';

// The fuel price client (v3 spec §4.3, decision 30; test plan §12 "Fuel client"). Only fakes here:
// a fake FuelPriceSource for the daily cache and fallbacks, and a fake fetch for the OilPriceAPI
// source's request shape. No test ever reaches the real API, and the fake key never surfaces in an
// error, a status or a console call.
useSeededDatabase();

const KEY='fake-key-123';
const load=async()=>({fuel:await import('./fuel-price'),repo:await import('@/server/repository')});

/** A FuelPriceSource fake: answers each gasoline(state) from `answer`, recording the states asked for. */
function fakeSource(answer:(state:string)=>Promise<{cents:number;asOf:string}>){
  const calls:string[]=[];
  return {calls,source:{gasoline:async(state:string)=>{calls.push(state);return answer(state);}}};
}
const price=(cents:number,asOf='2026-10-09T15:00:00.000Z')=>async()=>({cents,asOf});
const failing=async()=>{throw new Error(`upstream said no to Token ${KEY}`);};

/** A fake fetch: records each request and answers with `body` (and `status`). */
function fakeFetch(body:unknown,status=200){
  const requests:{url:string;headers:Record<string,string>}[]=[];
  const fetchImpl=async(url:string,init:{headers:Record<string,string>})=>{
    requests.push({url,headers:init.headers});
    return {ok:status>=200&&status<300,status,json:async()=>body};
  };
  return {requests,fetchImpl};
}

afterEach(async()=>{
  for(const key of ['freight_fuel_manual_cents','freight_fuel_type'])await setSettingFixture(key,null);
  vi.restoreAllMocks();
});

describe('the OilPriceAPI source (a fake fetch; never the real API)',()=>{
  it('asks for GASOLINE_RETAIL_STATE_<ST>_USD at api.oilpriceapi.com/v1 with "Authorization: Token <key>", not Bearer',async()=>{
    const {fuel}=await load();
    const {requests,fetchImpl}=fakeFetch({status:'success',data:{price:3.479,code:'GASOLINE_RETAIL_STATE_UT_USD',created_at:'2026-10-09T15:30:00.000Z',as_of:'2026-10-06T00:00:00.000Z'}});
    const source=fuel.oilPriceApiSource(KEY,fetchImpl);
    expect(await source.gasoline('UT')).toEqual({cents:348,asOf:'2026-10-06T00:00:00.000Z'});
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://api.oilpriceapi.com/v1/prices/latest?by_code=GASOLINE_RETAIL_STATE_UT_USD');
    expect(requests[0].headers.Authorization).toBe(`Token ${KEY}`);
    expect(JSON.stringify(requests[0].headers)).not.toMatch(/Bearer/);
    expect(fuel.gasolineCode('CA')).toBe('GASOLINE_RETAIL_STATE_CA_USD');
  });

  it('takes created_at when the answer has no as_of',async()=>{
    const {fuel}=await load();
    const {fetchImpl}=fakeFetch({status:'success',data:{price:3.4,code:'GASOLINE_RETAIL_STATE_UT_USD',created_at:'2026-10-09T15:30:00.000Z'}});
    expect(await fuel.oilPriceApiSource(KEY,fetchImpl).gasoline('UT')).toEqual({cents:340,asOf:'2026-10-09T15:30:00.000Z'});
  });

  it('refuses an error status, another code, or a missing or negative price, and never puts the key in the error',async()=>{
    const {fuel}=await load();
    const answers:[unknown,number][]=[
      [{status:'error',error:`bad key ${KEY}`},401],
      [{status:'success',data:{price:3.4,code:'GASOLINE_RETAIL_STATE_CA_USD',created_at:'2026-10-09T15:30:00.000Z'}},200],
      [{status:'success',data:{code:'GASOLINE_RETAIL_STATE_UT_USD',created_at:'2026-10-09T15:30:00.000Z'}},200],
      [{status:'success',data:{price:-1,code:'GASOLINE_RETAIL_STATE_UT_USD',created_at:'2026-10-09T15:30:00.000Z'}},200],
      [null,200],
    ];
    for(const [body,status] of answers){
      const error=await fuel.oilPriceApiSource(KEY,fakeFetch(body,status).fetchImpl).gasoline('UT').catch((e:unknown)=>e);
      expect(error).toBeInstanceOf(fuel.FuelPriceError);
      expect(String((error as Error).message)+String((error as Error).stack)).not.toContain(KEY);
    }
    // A network failure whose own message carries the key.
    const thrown=await fuel.oilPriceApiSource(KEY,async()=>{throw new Error(`connect failed with Token ${KEY}`);}).gasoline('UT').catch((e:unknown)=>e);
    expect(thrown).toBeInstanceOf(fuel.FuelPriceError);
    expect(JSON.stringify({message:(thrown as Error).message,cause:String((thrown as Error).cause??'')})).not.toContain(KEY);
  });

  it('refuses a state that is not two letters without fetching',async()=>{
    const {fuel}=await load();
    const {requests,fetchImpl}=fakeFetch({});
    for(const state of ['Utah','u','U1','UT&x=1'])await expect(fuel.oilPriceApiSource(KEY,fetchImpl).gasoline(state)).rejects.toBeInstanceOf(fuel.FuelPriceError);
    expect(requests).toEqual([]);
  });

  it('is built only when OILPRICEAPI_KEY is set',async()=>{
    const {fuel}=await load();
    expect(fuel.configuredFuelPriceSource({})).toBeNull();
    expect(fuel.configuredFuelPriceSource({OILPRICEAPI_KEY:'  '})).toBeNull();
    expect(fuel.configuredFuelPriceSource({OILPRICEAPI_KEY:KEY})).not.toBeNull();
  });
});

describe('the seeded price',()=>{
  it('stores UT gasoline at 340¢ from the seed, as of the seed date, so the demo never needs the API',async()=>{
    const {repo}=await load();
    expect(repo.storedFuelPrice('UT','gasoline')).toEqual({state:'UT',fuel:'gasoline',price_cents:340,as_of:'2026-09-23T00:00:00.000Z',source:'seed',fetched_on:'2026-09-23'});
    expect(repo.storedFuelPrice('UT','diesel')).toBeUndefined();
  });
});

describe('refreshFuelPrice: lazily, at most one fetch per state per UTC day',()=>{
  it('fetches once on a new day and stores the API price; later calls that day read the store',async()=>{
    const {fuel,repo}=await load();
    const {calls,source}=fakeSource(price(352,'2026-10-06T00:00:00.000Z'));
    expect(await fuel.refreshFuelPrice('UT',{source,now:'2026-10-10T08:00:00.000Z'})).toBe('fetched');
    expect(repo.storedFuelPrice('UT','gasoline')).toEqual({state:'UT',fuel:'gasoline',price_cents:352,as_of:'2026-10-06T00:00:00.000Z',source:'api',fetched_on:'2026-10-10'});
    expect(await fuel.refreshFuelPrice('UT',{source,now:'2026-10-10T23:59:59.000Z'})).toBe('fresh');
    expect(calls).toEqual(['UT']);
    // The next UTC day fetches again.
    expect(await fuel.refreshFuelPrice('UT',{source,now:'2026-10-11T00:00:01.000Z'})).toBe('fetched');
    expect(calls).toEqual(['UT','UT']);
  });

  it('shares one fetch between calls that arrive together',async()=>{
    const {fuel}=await load();
    const {calls,source}=fakeSource(price(355));
    const now='2026-10-12T08:00:00.000Z';
    expect(await Promise.all([fuel.refreshFuelPrice('UT',{source,now}),fuel.refreshFuelPrice('UT',{source,now})])).toEqual(['fetched','fetched']);
    expect(calls).toEqual(['UT']);
  });

  it('on a failure keeps the last stored price, counts the attempt for the day, and leaks nothing',async()=>{
    const {fuel,repo}=await load();
    const logged=(['log','info','warn','error','debug'] as const).map(m=>vi.spyOn(console,m).mockImplementation(()=>{}));
    const before=repo.storedFuelPrice('UT','gasoline')!;
    const {calls,source}=fakeSource(failing);
    const now='2026-10-13T08:00:00.000Z';
    expect(await fuel.refreshFuelPrice('UT',{source,now})).toBe('failed');
    expect(await fuel.refreshFuelPrice('UT',{source,now:'2026-10-13T09:00:00.000Z'})).toBe('fresh');
    expect(calls).toEqual(['UT']);
    expect(repo.storedFuelPrice('UT','gasoline')).toEqual({...before,fetched_on:'2026-10-13'});
    const status=fuel.fuelPriceStatus('UT',now);
    expect(status).toMatchObject({cents:before.price_cents,source:'api',asOf:before.as_of});
    expect(JSON.stringify(status)).not.toContain(KEY);
    for(const spy of logged)expect(JSON.stringify(spy.mock.calls)).not.toContain(KEY);
  });

  it('never fetches without a source (no key): the last stored price stays in use',async()=>{
    const {fuel}=await load();
    expect(await fuel.refreshFuelPrice('UT',{source:null,now:'2026-10-14T08:00:00.000Z'})).toBe('skipped');
    expect(fuel.fuelPriceStatus('UT','2026-10-14T08:00:00.000Z').cents).toBeGreaterThan(0);
  });

  it('never fetches while a manual price is set, or for diesel (TODO R-9)',async()=>{
    const {fuel}=await load();
    const {calls,source}=fakeSource(price(360));
    await setSettingFixture('freight_fuel_manual_cents','399');
    expect(await fuel.refreshFuelPrice('UT',{source,now:'2026-10-15T08:00:00.000Z'})).toBe('skipped');
    await setSettingFixture('freight_fuel_manual_cents',null);
    await setSettingFixture('freight_fuel_type','diesel');
    expect(await fuel.refreshFuelPrice('UT',{source,now:'2026-10-15T08:00:00.000Z'})).toBe('skipped');
    expect(calls).toEqual([]);
  });

  it('with nothing ever stored and the fetch failing: no price, fuel 0, a manual price required; no second try that day',async()=>{
    const {fuel,repo}=await load();
    const {calls,source}=fakeSource(failing);
    const now='2026-10-16T08:00:00.000Z';
    expect(await fuel.refreshFuelPrice('NV',{source,now})).toBe('failed');
    expect(await fuel.refreshFuelPrice('NV',{source,now})).toBe('fresh');
    expect(calls).toEqual(['NV']);
    expect(repo.storedFuelPrice('NV','gasoline')).toBeUndefined();
    expect(fuel.fuelPriceStatus('NV',now)).toEqual({state:'NV',fuelType:'gasoline',cents:0,source:'none',asOf:null,ageDays:null,warnings:['No fuel price. Enter one by hand.']});
  });
});

describe('fuelPriceStatus: the price in use and its warnings',()=>{
  it('reads the stored price with its age, warning only once it is more than 14 days old',async()=>{
    const {fuel,repo}=await load();
    repo.saveFuelPrice({state:'ID',fuel:'gasoline',price_cents:331,as_of:'2026-10-01T00:00:00.000Z',source:'api',fetched_on:'2026-10-01'});
    expect(fuel.fuelPriceStatus('ID','2026-10-15T12:00:00.000Z')).toEqual({state:'ID',fuelType:'gasoline',cents:331,source:'api',asOf:'2026-10-01T00:00:00.000Z',ageDays:14,warnings:[]});
    expect(fuel.fuelPriceStatus('ID','2026-10-16T00:00:00.000Z')).toMatchObject({ageDays:15,warnings:['Fuel price is 15 days old.']});
  });

  it('lets a manual price win over the stored one, even $0 (with a warning)',async()=>{
    const {fuel}=await load();
    await setSettingFixture('freight_fuel_manual_cents','412');
    expect(fuel.fuelPriceStatus('ID','2026-11-30T00:00:00.000Z')).toEqual({state:'ID',fuelType:'gasoline',cents:412,source:'manual',asOf:null,ageDays:null,warnings:[]});
    await setSettingFixture('freight_fuel_manual_cents','0');
    expect(fuel.fuelPriceStatus('ID','2026-10-16T00:00:00.000Z')).toMatchObject({cents:0,source:'manual',warnings:['The fuel price in use is $0.00, so deliveries are modelled with no fuel cost.']});
  });

  it('prices diesel by hand only: the manual price, or $0 with a warning',async()=>{
    const {fuel}=await load();
    await setSettingFixture('freight_fuel_type','diesel');
    expect(fuel.fuelPriceStatus('UT','2026-10-16T00:00:00.000Z')).toEqual({state:'UT',fuelType:'diesel',cents:0,source:'none',asOf:null,ageDays:null,warnings:['No fuel price. Enter one by hand.']});
    await setSettingFixture('freight_fuel_manual_cents','389');
    expect(fuel.fuelPriceStatus('UT','2026-10-16T00:00:00.000Z')).toMatchObject({fuelType:'diesel',cents:389,source:'manual',warnings:[]});
  });

  it('warns when the stored price is zero',async()=>{
    const {fuel,repo}=await load();
    repo.saveFuelPrice({state:'WY',fuel:'gasoline',price_cents:0,as_of:'2026-10-15T00:00:00.000Z',source:'api',fetched_on:'2026-10-15'});
    expect(fuel.fuelPriceStatus('WY','2026-10-16T00:00:00.000Z').warnings).toEqual(['The fuel price in use is $0.00, so deliveries are modelled with no fuel cost.']);
  });
});
