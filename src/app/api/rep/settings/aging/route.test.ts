import {NextRequest} from 'next/server';
import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// GET/PUT /api/rep/settings/aging (v3 spec §1.3, §5; decision 16; task D1): the six aging thresholds
// in hours, editable by managers only. The aging rule (agingThresholds) reads what is saved.
useSeededDatabase();

const DEFAULTS={rfrAmberH:4,rfrRedH:24,crAmberH:4,crRedH:24,sentAmberH:72,sentRedH:168};

async function call(method:'GET'|'PUT',{body,persona='supplier'}:{body?:unknown;persona?:string|null}={}){
  const route=await import('./route');
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  const request=new NextRequest('http://127.0.0.1/api/rep/settings/aging',{method,headers,body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
  const response=await route[method](request);
  return {status:response.status,cache:response.headers.get('cache-control'),json:await response.json()};
}

describe('GET/PUT /api/rep/settings/aging',()=>{
  it('gives the manager the thresholds (defaults on the seed), never cached',async()=>{
    expect(await call('GET')).toMatchObject({status:200,cache:expect.stringMatching(/no-store/),json:DEFAULTS});
  });

  it('saves six whole hours and the aging rule follows',async()=>{
    const next={...DEFAULTS,rfrAmberH:2,sentRedH:120};
    expect(await call('PUT',{body:next})).toMatchObject({status:200,json:next});
    const {agingThresholds}=await import('@/server/repository');
    expect(agingThresholds()).toEqual(next);
    expect((await call('GET')).json).toEqual(next);
  });

  it('refuses amber at or after red, a fraction, or out-of-range hours with the reason',async()=>{
    const before=(await call('GET')).json;
    expect(await call('PUT',{body:{...before,rfrAmberH:24,rfrRedH:24}})).toMatchObject({status:400,json:{detail:'Ready for review: amber must come before red.'}});
    expect(await call('PUT',{body:{...before,crAmberH:1.5}})).toMatchObject({status:400,json:{detail:'Enter whole hours for Changes requested amber.'}});
    expect(await call('PUT',{body:{...before,sentRedH:0}})).toMatchObject({status:400});
    expect(await call('PUT',{body:'nope'})).toMatchObject({status:400});
    expect((await call('GET')).json).toEqual(before);
  });

  it('refuses reps and the customer (403) and no session (401), changing nothing',async()=>{
    const before=(await call('GET')).json;
    for(const persona of ['mara','eli','customer']){
      expect((await call('GET',{persona})).status).toBe(403);
      expect((await call('PUT',{persona,body:DEFAULTS})).status).toBe(403);
    }
    expect((await call('GET',{persona:null})).status).toBe(401);
    expect((await call('PUT',{persona:null,body:DEFAULTS})).status).toBe(401);
    expect((await call('GET')).json).toEqual(before);
  });
});
