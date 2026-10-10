import {NextRequest} from 'next/server';
import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// POST /api/rep/quotes/reassign {quoteIds, toRepId} (v3 spec §5, §8; decision 21; task D2): the
// manager only (managerRoute): a rep or the customer 403, no session 401. Idempotency-Key replay
// like the other rep writes; a malformed key is 400. Never cached.
useSeededDatabase();

async function post(body:unknown,{persona='supplier',key}:{persona?:string|null;key?:string}={}){
  const headers:Record<string,string>={'content-type':'application/json'};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  if(key!==undefined)headers['idempotency-key']=key;
  const response=await (await import('./route')).POST(new NextRequest('http://127.0.0.1/api/rep/quotes/reassign',{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)}));
  return {status:response.status,cache:response.headers.get('cache-control'),json:await response.json()};
}
async function marasQuote(){
  const {createQuote}=await import('@/server/repository');
  return createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'GLV-N8-L-1000',qty:2,unitPrice:82,priceBasis:'custom'}]});
}
const owner=async(id:string)=>(await import('@/server/repository')).quote(id)!.rep_id;

describe('who may reassign',()=>{
  it('refuses reps and the customer (403) and no session (401), moving nothing',async()=>{
    const q=await marasQuote();
    for(const persona of ['mara','eli','customer'])expect(await post({quoteIds:[q.id],toRepId:'eli'},{persona})).toMatchObject({status:403});
    expect((await post({quoteIds:[q.id],toRepId:'mara'},{persona:'mara'})).json).toEqual({detail:'Manager access required.'});
    expect(await post({quoteIds:[q.id],toRepId:'eli'},{persona:null})).toMatchObject({status:401});
    expect(await owner(q.id)).toBe('mara');
  });
});

describe('POST /api/rep/quotes/reassign',()=>{
  it('moves the quotes and answers what moved and what was skipped, never cached',async()=>{
    const a=await marasQuote(),b=await marasQuote();
    const moved=await post({quoteIds:[a.quote_number,b.id],toRepId:'eli'});
    expect(moved).toMatchObject({status:200,cache:expect.stringMatching(/no-store/),json:{replayed:false,to:{id:'eli',name:'Eli Porter'},skipped:[],
      moved:[{id:a.id,quote_number:a.quote_number,from:{id:'mara',name:'Mara Jensen'}},{id:b.id,quote_number:b.quote_number,from:{id:'mara',name:'Mara Jensen'}}]}});
    expect([await owner(a.id),await owner(b.id)]).toEqual(['eli','eli']);
    const again=await post({quoteIds:[a.id],toRepId:'eli'});
    expect(again.json).toMatchObject({moved:[],skipped:[{id:a.id,quote_number:a.quote_number}]});
  });

  it('refuses an inactive or unknown target and bad input (400), and an unknown quote (404)',async()=>{
    const q=await marasQuote();
    expect(await post({quoteIds:[q.id],toRepId:'nobody'})).toMatchObject({status:400});
    expect(await post({quoteIds:[],toRepId:'eli'})).toMatchObject({status:400});
    expect(await post('not json')).toMatchObject({status:400});
    expect(await post({quoteIds:[q.id,'Q-99999'],toRepId:'eli'})).toMatchObject({status:404,json:{detail:'No quote Q-99999.'}});
    expect(await owner(q.id)).toBe('mara');
  });

  it('replays a repeated Idempotency-Key and refuses a malformed one',async()=>{
    const q=await marasQuote();
    const first=await post({quoteIds:[q.id],toRepId:'eli'},{key:'reassign-1'});
    expect(first.json.replayed).toBe(false);
    const second=await post({quoteIds:[q.id],toRepId:'eli'},{key:'reassign-1'});
    expect(second).toMatchObject({status:200,json:{replayed:true,moved:first.json.moved}});
    const {quoteActivity}=await import('@/server/repository');
    expect(quoteActivity(q.id).filter(a=>a.kind==='reassigned')).toHaveLength(1);
    expect(await post({quoteIds:[q.id],toRepId:'brandi'},{key:'bad key!'})).toMatchObject({status:400,json:{code:'invalid_input'}});
    expect(await owner(q.id)).toBe('eli');
  });
});
