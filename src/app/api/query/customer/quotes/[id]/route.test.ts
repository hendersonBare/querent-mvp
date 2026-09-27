import {NextRequest} from 'next/server';
import {beforeAll,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// GET /api/query/customer/quotes/:id (task 5.1): the preview modal's data, Dana's own quotes only.

const FORBIDDEN=/cost|margin|floor|suggest|explanation|internal/i;
const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];

async function get(id:string,{persona='customer',query=''}:{persona?:string;query?:string}={}){
  const {GET}=await import('./route');
  const request=new NextRequest(`http://127.0.0.1/api/query/customer/quotes/${encodeURIComponent(id)}${query}`,{headers:persona?{cookie:`querent-persona=${persona}`}:{}});
  const response=await GET(request,{params:Promise.resolve({id})});
  return {status:response.status,headers:response.headers,json:await response.json()};
}

let theirs:{id:string;quote_number:string};
beforeAll(async()=>{
  const {createConversation,createQuote}=await import('@/server/repository');
  const {sendQuote}=await import('@/server/quotes/service');
  await sendQuote('q-24817',{repId:'brandi',message:'Hi Dana',attachPdf:true,now:new Date().toISOString()});
  createConversation({id:'conv-gb-preview',customerId:'great-basin'});
  theirs=createQuote({customerId:'great-basin',conversationId:'conv-gb-preview',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'HCS-12-13-2G8',qty:1,unitPrice:40}]});
  await sendQuote(theirs.id,{repId:'brandi',now:new Date().toISOString()});
});

describe('GET customer/quotes/:id',()=>{
  it('asks for a workspace without a session, and refuses the supplier',async()=>{
    expect(await get('q-24817',{persona:''})).toMatchObject({status:401,json:{detail:'Choose a demo workspace.'}});
    expect(await get('q-24817',{persona:'supplier'})).toMatchObject({status:403,json:{detail:'Customer access required.'}});
  });

  it('shows Dana the revision Brandi sent, by id or number, uncached and without internal fields',async()=>{
    const byId=await get('q-24817');
    expect(byId.status).toBe(200);
    expect(byId.headers.get('cache-control')).toBe('private, no-store');
    expect(byId.json).toMatchObject({id:'q-24817',quote_number:'Q-24817',status:'sent',latest_revision:1,
      shown:{revision:1,total:1122.4,attach_pdf:true,pdf_url:'/api/quotes/q-24817/pdf?variant=customer&rev=1'}});
    expect(keys(byId.json).filter(k=>FORBIDDEN.test(k))).toEqual([]);
    expect((await get('Q-24817')).json).toEqual(byId.json);
    expect((await get('q-24817',{query:'?rev=1'})).json).toEqual(byId.json);
  });

  it('is the same 404 for a tampered id: another customer’s quote, an unknown one, a revision never sent',async()=>{
    for(const [id,query] of [[theirs.id,''],[theirs.quote_number,''],[theirs.id,'?rev=1'],['q-nope',''],['q-24817','?rev=2'],["q-24817' OR 1=1 --",'']] as const){
      const response=await get(id,{query});
      expect(response,`${id}${query}`).toMatchObject({status:404,json:{detail:'Quote not found.'}});
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
  });

  it('refuses a rev that isn’t a revision number',async()=>{
    for(const query of ['?rev=0','?rev=draft','?rev=-1','?rev=1.5','?rev='])
      expect((await get('q-24817',{query})).status,query).toBe(400);
  });
});
