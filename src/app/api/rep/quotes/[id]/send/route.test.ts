// @vitest-environment node
import {NextRequest} from 'next/server';
import {beforeEach,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// POST /api/rep/quotes/<id or number>/send (task 3.7): Approve & send's Confirm send. Rep-only
// (401 / 403 before anything is read), the rep's own quote only (404), validated (400), refused
// when it can't go (409 / 422), one send per Idempotency-Key, and never cached.
useSeededDatabase();

const CONFIRMED={message:'Hi Dana, your quote is ready. Thanks, Brandi',attach_pdf:true,revision:1,total:1122.4};

async function post(id:string,body:unknown=CONFIRMED,{persona='supplier',key}:{persona?:string|null;key?:string}={}){
  const {POST}=await import('./route');
  const headers:Record<string,string>={'content-type':'application/json'};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  if(key!==undefined)headers['idempotency-key']=key;
  const request=new NextRequest(`http://127.0.0.1/api/rep/quotes/${id}/send`,{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});
  return POST(request,{params:Promise.resolve({id})});
}
const state=async()=>{
  const {quote,quoteRevisions,conversationMessages}=await import('@/server/repository');
  return {status:quote('q-24817')!.status,revisions:quoteRevisions('q-24817').length,messages:conversationMessages('wasatch','conv-q-24817').length};
};

beforeEach(async()=>{(await import('@/server/quotes/service')).resetSample();});

it('refuses visitors (401) and customers (403), sending nothing',async()=>{
  const before=await state();
  expect((await post('Q-24817',CONFIRMED,{persona:null})).status).toBe(401);
  const customer=await post('Q-24817',CONFIRMED,{persona:'customer'});
  expect(customer.status).toBe(403);
  expect(await customer.json()).toEqual({detail:'Supplier access required.'});
  expect(await state()).toEqual(before);
});

it('sends the quote: 200 with the fresh detail and what went to the chat, never cached',async()=>{
  const before=await state();
  const response=await post('Q-24817',CONFIRMED,{key:'route-send-1'});
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toMatch(/no-store/);
  const body=await response.json();
  expect(body).toMatchObject({replayed:false,sent:{quote_number:'Q-24817',revision:1,total:1122.4,attach_pdf:true,conversation_id:'conv-q-24817'},
    detail:{editable:false,quote:{status:'sent',revision:1}}});
  expect(body.sent.headline).toMatch(/^Quote Q-24817 is ready: \$1,122\.40, valid until [A-Z][a-z]{2} \d{1,2}$/);
  expect(await state()).toEqual({status:'sent',revisions:1,messages:before.messages+1});
});

it('sends once for a double click: the same key twice at once answers the same send',async()=>{
  const [a,b]=await Promise.all([post('Q-24817',CONFIRMED,{key:'double'}),post('Q-24817',CONFIRMED,{key:'double'})]);
  expect([a.status,b.status]).toEqual([200,200]);
  const [first,second]=[await a.json(),await b.json()];
  expect([first.replayed,second.replayed].sort()).toEqual([false,true]);
  expect(second.sent).toEqual(first.sent);
  expect((await state()).revisions).toBe(1);
});

it('refuses a second send with another key or none (409), sending nothing more',async()=>{
  expect((await post('Q-24817',CONFIRMED,{key:'first'})).status).toBe(200);
  const before=await state();
  for(const key of ['second',undefined]){
    const again=await post('Q-24817',CONFIRMED,{key});
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({detail:'Can\'t send Q-24817: it is Sent.',code:'illegal_transition'});
  }
  expect(await state()).toEqual(before);
});

it('answers 409 conflict when the quote changed since Confirm send',async()=>{
  const response=await post('Q-24817',{...CONFIRMED,total:1000});
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({detail:'Q-24817 now totals $1,122.40, not the $1,000.00 you confirmed. Review it and send again.',code:'conflict'});
  expect((await state()).status).toBe('ready_for_review');
});

it('answers 422 with the blockers when the quote is unfinished',async()=>{
  const {updateQuoteLine}=await import('@/server/repository');
  updateQuoteLine('q-24817','q-24817-2',{qty:0});
  const response=await post('Q-24817');
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({code:'send_blocked',detail:expect.stringContaining('Line 2 (CW-45-045-T1) has a quantity of 0.'),
    blockers:[{code:'zero_qty',line_id:'q-24817-2',message:'Line 2 (CW-45-045-T1) has a quantity of 0.'}]});
  expect((await state()).status).toBe('ready_for_review');
});

it('answers 400 for a bad body, a malformed key or a message over the limit',async()=>{
  const before=await state();
  for(const body of ['not json',{},{...CONFIRMED,channel:'email'},{...CONFIRMED,message:'x'.repeat(2001)}]){
    const response=await post('Q-24817',body);
    expect(response.status,JSON.stringify(body)).toBe(400);
    expect(await response.json()).toMatchObject({code:'invalid_input',detail:expect.any(String)});
  }
  const badKey=await post('Q-24817',CONFIRMED,{key:'not a key'});
  expect(badKey.status).toBe(400);
  expect(await state()).toEqual(before);
});

it('answers 404 for another rep’s quote and an unknown one',async()=>{
  const {createQuote,quote}=await import('@/server/repository');
  const other=createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'GLV-N8-L-1000',qty:1,unitPrice:82}]});
  const response=await post(other.quote_number,{...CONFIRMED,total:82});
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({detail:`No quote ${other.quote_number}.`,code:'not_found'});
  expect((await post('Q-99999')).status).toBe(404);
  expect(quote(other.id)?.status).toBe('ready_for_review');
});
