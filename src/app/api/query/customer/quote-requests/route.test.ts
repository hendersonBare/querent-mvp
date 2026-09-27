import {NextRequest} from 'next/server';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// POST /api/query/customer/quote-requests and GET /api/query/customer/item-popup (task 2.3): Dana's
// item pop-up and its Request quote, over HTTP. These static routes take precedence over the
// /api/query/[...path] catch-all.

type Persona='customer'|'supplier';
const url=(path:string)=>`http://127.0.0.1/api/query/customer/${path}`;
const headers=(persona?:Persona|null):Record<string,string>=>persona?{cookie:`querent-persona=${persona}`,'content-type':'application/json'}:{'content-type':'application/json'};
const post=async(body:unknown,persona:Persona|null='customer')=>{
  const {POST}=await import('./route');
  return POST(new NextRequest(url('quote-requests'),{method:'POST',headers:headers(persona),body:typeof body==='string'?body:JSON.stringify(body)}));
};
const popupContext=async(query:string,persona?:Persona)=>{
  const {GET}=await import('../item-popup/route');
  return GET(new NextRequest(url(`item-popup${query}`),{headers:headers(persona)}));
};
const badge=async()=>{
  const {GET}=await import('@/app/api/rep/badges/route');
  return (await GET(new NextRequest('http://127.0.0.1/api/rep/badges',{headers:headers('supplier')})).json()).quotes as number;
};

/** Keys a customer may never see, and the seeded unit costs of the two items (HCS-12-13-2G8 $21.40, CW-45-045-T1 $24.10). */
const FORBIDDEN=/cost|margin|floor|suggest|explanation|basis|internal|price|gp/i;
const SEEDED_COSTS=/(?<![\w.:-])\$?(?:21\.40?|24\.10?)(?![\w:])/;
const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];

const REQUEST='Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels. We\'ll pick up at SLC.';
const cart=(conversation_id:string)=>({conversation_id,fulfillment:'will_call',branch_id:'slc',lines:[{sku:'HCS-12-13-2G8',qty:10},{sku:'CW-45-045-T1',qty:6}]});

let scripted:string|undefined;
beforeAll(()=>{scripted=process.env.QUERENT_SCRIPTED;process.env.QUERENT_SCRIPTED='1';});
afterAll(()=>{if(scripted===undefined)delete process.env.QUERENT_SCRIPTED;else process.env.QUERENT_SCRIPTED=scripted;});

let chats=0;
async function popupConversation(){
  const {ask}=await import('@/server/pipeline');
  const id=`route-popup-${++chats}`;
  await ask('wasatch',id,REQUEST,{contactId:'dana'});
  expect(await ask('wasatch',id,'Type 1',{contactId:'dana'})).toMatchObject({kind:'item_popup'});
  return id;
}

describe('POST customer/quote-requests',()=>{
  it('asks for a workspace without a session, and refuses the supplier',async()=>{
    const anonymous=await post({},null);
    expect(anonymous.status).toBe(401);
    expect((await anonymous.json()).detail).toBe('Choose a demo workspace.');
    const supplier=await post({},'supplier');
    expect(supplier.status).toBe(403);
    expect((await supplier.json()).detail).toBe('Customer access required.');
  });

  it('creates the quote for Brandi (201) and answers with customer-safe fields only',async()=>{
    const id=await popupConversation();
    const before=await badge();
    const response=await post(cart(id));
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const result=await response.json();
    expect(result).toMatchObject({replayed:false,quote:{quote_number:expect.stringMatching(/^Q-\d+$/),status:'ready_for_review'}});
    expect(result.turn.answer).toMatch(new RegExp(`^Sent to Brandi for review\\. Your quote number is \\*\\*${result.quote.quote_number}\\*\\*\\.`));
    expect(await badge()).toBe(before+1);

    // Deep scan of what went over the wire: no cost-like key, no price or cost value, no dollar amount.
    expect(keys(result).filter(k=>FORBIDDEN.test(k))).toEqual([]);
    const text=JSON.stringify(result);
    expect(text).not.toMatch(SEEDED_COSTS);
    expect(text).not.toContain('$');
    const {quote}=await import('@/server/repository');
    const q=quote(result.quote.id)!;
    expect(q.lines.every(l=>l.unit_price!==null&&l.explanation)).toBe(true);
    for(const line of q.lines)for(const amount of [line.unit_price!,line.suggested_price!,line.unit_cost])
      expect(text).not.toMatch(new RegExp(`(?<![\\w.:-])${String(amount).replace('.','\\.')}(?![\\w:]|\\.\\d*[1-9])`));
  });

  it('makes one quote from a double click: the second answer replays the first (200)',async()=>{
    const {quotes}=await import('@/server/repository');
    const id=await popupConversation();
    const count=quotes({customerId:'wasatch'}).length,before=await badge();
    const [first,second]=await Promise.all([post(cart(id)),post(cart(id))]);
    expect([first.status,second.status].sort()).toEqual([200,201]);
    const [a,b]=[await first.json(),await second.json()];
    expect(a.quote).toEqual(b.quote);
    expect([a.replayed,b.replayed].sort()).toEqual([false,true]);
    expect(quotes({customerId:'wasatch'})).toHaveLength(count+1);
    expect(await badge()).toBe(before+1);
  });

  it('refuses a price or cost in the body, bad qty, and a body that is not JSON (422)',async()=>{
    const id=await popupConversation();
    for(const body of [{...cart(id),unit_price:0.01},{...cart(id),lines:[{sku:'HCS-12-13-2G8',qty:10,cost:0}]},{...cart(id),lines:[{sku:'HCS-12-13-2G8',qty:0}]},'not json']){
      const response=await post(body);
      expect(response.status).toBe(422);
      expect(typeof (await response.json()).detail).toBe('string');
    }
  });

  it("answers 404 for another customer's conversation and 409 for a chat without a pop-up",async()=>{
    const {createConversation,addMessage}=await import('@/server/repository');
    createConversation({id:'great-basin-route',customerId:'great-basin'});
    addMessage('great-basin','great-basin-route',{role:'assistant',kind:'item_popup',content:'Here is your list.',payload:{fulfillment:'will_call',branch_id:'slc',lines:[{sku:'HCS-12-13-2G8',qty:10}]}});
    const theirs=await post({...cart('great-basin-route'),lines:[{sku:'HCS-12-13-2G8',qty:10}]});
    expect(theirs.status).toBe(404);
    expect((await theirs.json()).detail).toBe('Conversation not found.');
    createConversation({id:'no-popup-route',customerId:'wasatch'});
    expect((await post(cart('no-popup-route'))).status).toBe(409);
  });
});

describe('GET customer/item-popup',()=>{
  it('asks for a workspace without a session, and refuses the supplier',async()=>{
    expect((await popupContext('?skus=HCS-12-13-2G8')).status).toBe(401);
    expect((await popupContext('?skus=HCS-12-13-2G8','supplier')).status).toBe(403);
  });

  it('gives stock per branch for the SKUs asked about, and no prices',async()=>{
    const response=await popupContext('?skus=HCS-12-13-2G8,CW-45-045-T1','customer');
    expect(response.status).toBe(200);
    const body=await response.json();
    expect(body.items.map((i:{sku:string})=>i.sku)).toEqual(['HCS-12-13-2G8','CW-45-045-T1']);
    expect(body.items[0].stock).toContainEqual({branch_id:'slc',available:64});
    expect(body).toMatchObject({stock_shown:true,rep_name:'Brandi Gallegos'});
    expect(keys(body).filter(k=>FORBIDDEN.test(k))).toEqual([]);
    expect((await (await popupContext('','customer')).json()).items).toEqual([]);
  });
});
