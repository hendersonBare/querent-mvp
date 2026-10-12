// @vitest-environment node
import {NextRequest} from 'next/server';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// GET/PUT /api/rep/settings/freight and GET /api/rep/settings/freight/preview (v3 spec §4.3, §4.7,
// §5; decisions 30, 35; OA-11): manager only, never cached. The fuel key is read server-side only:
// with a (fake) OILPRICEAPI_KEY set, the request goes to a stubbed fetch, never the network, and the
// key appears in no response. Each part of the PUT, and the preview, is refused (403 feature_off) while its
// section's flag is off (decision 48; plan U8); the tests above that block turn the three flags on.
useSeededDatabase();

const KEY='fake-key-123';

async function call(path:''|'/preview',method:'GET'|'PUT',{body,persona='supplier'}:{body?:unknown;persona?:string|null}={}){
  const route=path===''?await import('./route'):await import('./preview/route');
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  const request=new NextRequest(`http://127.0.0.1/api/rep/settings/freight${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const handler=(route as unknown as Record<string,(r:NextRequest)=>Promise<Response>>)[method];
  const response=await handler(request);
  const text=await response.text();
  return {status:response.status,cache:response.headers.get('cache-control'),text,json:JSON.parse(text)};
}

const FLAGS=['FEATURE_FREE_DELIVERY_PRICING','FEATURE_RECOVERY_POOL','FEATURE_DELIVERY_COST_MODEL'] as const;
const flags=(on:readonly (typeof FLAGS)[number][])=>{for(const name of FLAGS)vi.stubEnv(name,on.includes(name)?'1':'');};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});

describe('GET/PUT /api/rep/settings/freight',()=>{
  beforeEach(()=>flags(FLAGS));

  it('gives the manager the controls, the pool and the fuel price, never cached',async()=>{
    const result=await call('','GET');
    expect(result).toMatchObject({status:200,cache:expect.stringMatching(/no-store/),json:{enabled:false,previewValid:false,rates:{startingRateBp:300},pool:{startingBp:300,minCount:20}}});
    expect(result.json.fuel[0]).toMatchObject({state:'UT',fuelType:'gasoline'});
  });

  it('with OILPRICEAPI_KEY set, asks OilPriceAPI (a stubbed fetch) with the Token header, and never returns the key',async()=>{
    vi.stubEnv('OILPRICEAPI_KEY',KEY);
    const requests:{url:string;auth:string}[]=[];
    vi.stubGlobal('fetch',vi.fn(async(url:string,init:{headers:Record<string,string>})=>{
      requests.push({url:String(url),auth:init.headers.Authorization});
      return new Response(JSON.stringify({status:'success',data:{price:3.62,code:'GASOLINE_RETAIL_STATE_UT_USD',created_at:new Date().toISOString()}}),{status:200});
    }));
    const result=await call('','GET');
    expect(requests).toEqual([{url:'https://api.oilpriceapi.com/v1/prices/latest?by_code=GASOLINE_RETAIL_STATE_UT_USD',auth:`Token ${KEY}`}]);
    expect(result.json.fuel[0]).toMatchObject({cents:362,source:'api'});
    expect(result.text).not.toContain(KEY);
    // A failing fetch the next time: still no key in the answer.
    vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error(`refused Token ${KEY}`);}));
    expect((await call('','GET')).text).not.toContain(KEY);
  });

  it('refuses to enable before the preview (409 preview_required), then enables after it',async()=>{
    expect(await call('','PUT',{body:{enabled:true}})).toMatchObject({status:409,json:{code:'preview_required'}});
    const preview=await call('/preview','GET');
    // The seed's 22 eligible pilot quotes (task F1) put the computed pool rate in force, not the 3.0% starting rate.
    const {pool}=(await call('','GET')).json;
    expect(pool).toMatchObject({usingPool:true,startingBp:300});
    expect(pool.baseBp).not.toBe(300);
    expect(preview).toMatchObject({status:200,cache:expect.stringMatching(/no-store/),json:{step1Bp:Math.round(pool.baseBp/3),fullBp:pool.baseBp,steps:3,windowDays:90}});
    expect(typeof preview.json.affected).toBe('number');
    expect(Array.isArray(preview.json.categories)).toBe(true);
    const on=await call('','PUT',{body:{enabled:true}});
    expect(on).toMatchObject({status:200,json:{enabled:true,previewValid:true,pool:{step:1}}});
    expect(await call('','PUT',{body:{enabled:false}})).toMatchObject({status:200,json:{enabled:false}});
  });

  it('refuses a bad value with the reason (400), changing nothing',async()=>{
    const before=(await call('','GET')).json;
    expect(await call('','PUT',{body:{rates:{rampSteps:13}}})).toMatchObject({status:400,json:{detail:'Ramp steps must be a whole number from 1 to 12.'}});
    expect((await call('','GET')).json.rates).toEqual(before.rates);
  });

  it('refuses reps and the customer (403) and no session (401)',async()=>{
    for(const persona of ['mara','eli','customer']){
      expect((await call('','GET',{persona})).status).toBe(403);
      expect((await call('','PUT',{persona,body:{enabled:false}})).status).toBe(403);
      expect((await call('/preview','GET',{persona})).status).toBe(403);
    }
    for(const path of ['','/preview'] as const)expect((await call(path,'GET',{persona:null})).status).toBe(401);
  });
});

describe("feature flags (decision 48): each section's writes are refused while its flag is off",()=>{
  it('all off by default: every part of the PUT and the preview answer 403 feature_off, changing nothing; the read still works',async()=>{
    flags([]);
    const before=(await call('','GET')).json;
    for(const [body,detail] of [
      [{enabled:true},'Free delivery pricing is turned off.'],
      [{enabled:false},'Free delivery pricing is turned off.'],
      [{rates:{rampSteps:4}},'The recovery pool is turned off.'],
      [{cost:{mpg:12}},'The delivery cost model is turned off.'],
    ] as const)expect(await call('','PUT',{body})).toMatchObject({status:403,json:{detail,code:'feature_off'}});
    expect(await call('/preview','GET')).toMatchObject({status:403,json:{detail:'Free delivery pricing is turned off.',code:'feature_off'}});
    const after=(await call('','GET')).json;
    expect(after).toMatchObject({enabled:false,previewViewedAt:before.previewViewedAt,rates:before.rates,cost:before.cost});
  });

  it('a part whose flag is on goes through, whatever the others; a body touching an off section is refused whole',async()=>{
    flags(['FEATURE_RECOVERY_POOL']);
    const saved=await call('','PUT',{body:{rates:{rampSteps:4}}});
    expect(saved).toMatchObject({status:200,json:{rates:{rampSteps:4}}});
    expect(await call('','PUT',{body:{rates:{rampSteps:3},cost:{mpg:12}}})).toMatchObject({status:403,json:{code:'feature_off'}});
    expect((await call('','GET')).json.rates.rampSteps).toBe(4);
    flags(['FEATURE_DELIVERY_COST_MODEL']);
    expect(await call('','PUT',{body:{cost:{mpg:12}}})).toMatchObject({status:200,json:{cost:{mpg:12}}});
    expect(await call('','PUT',{body:{rates:{rampSteps:3}}})).toMatchObject({status:403,json:{code:'feature_off'}});
    flags(['FEATURE_FREE_DELIVERY_PRICING']);
    expect((await call('/preview','GET')).status).toBe(200);
    flags(FLAGS);
    expect(await call('','PUT',{body:{rates:{rampSteps:3},cost:{mpg:10}}})).toMatchObject({status:200});
  });

  it('a rep is still refused first (403, not feature_off)',async()=>{
    flags([]);
    const result=await call('','PUT',{persona:'mara',body:{enabled:true}});
    expect(result.status).toBe(403);
    expect(result.json.code).toBeUndefined();
  });
});
