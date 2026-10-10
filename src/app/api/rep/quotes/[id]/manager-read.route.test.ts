// @vitest-environment node
// react-pdf's browser build (picked under jsdom) writes streams pdf.js can't read.
import {NextRequest} from 'next/server';
import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {setSettingFixture,useSeededDatabase} from '@/server/repository/test-db';

// The manager's read-only view of another rep's quote (v3 spec §3, §5, §8; decisions 22, 25, 26;
// task D2). Brandi (the manager) may read any quote: the detail, its chat, its PDFs and its CSV.
// Every write route still refuses her on Mara's quote with the existing not found, and changes
// nothing. Her read never stamps last_rep_touch_at, never reprices the draft and never clears
// Mara's unread flag. Another rep (Eli) still gets not found on every route.
useSeededDatabase();

type Handler=(request:NextRequest,context:{params:Promise<Record<string,string>>})=>Promise<Response>;
type Call={method:string;path:string;module:()=>Promise<Record<string,unknown>>;body?:unknown;key?:boolean};

let marasDraft={id:'',quote_number:'',line:''};

beforeAll(async()=>{
  vi.stubEnv('QUERENT_SCRIPTED','1');
  const {addMessage,createConversation,createQuote}=await import('@/server/repository');
  createConversation({id:'conv-canyon-d2',customerId:'canyon-ridge',at:'2026-09-23T10:00:00.000Z'});
  addMessage('canyon-ridge','conv-canyon-d2',{role:'customer',content:'Two cases of gloves, please',at:'2026-09-23T10:00:01.000Z'});
  const q=createQuote({customerId:'canyon-ridge',conversationId:'conv-canyon-d2',fulfillment:'will_call',branchId:'slc',
    lines:[{itemId:'GLV-N8-L-1000',qty:2,unitPrice:82,priceBasis:'custom'},{itemId:'HCS-12-13-2G8',qty:10,unitPrice:31.5,priceBasis:'custom'}]});
  marasDraft={id:q.id,quote_number:q.quote_number,line:q.lines[0].id};
});
afterAll(()=>{vi.unstubAllEnvs();});
afterEach(async()=>{for(const key of ['free_delivery_pricing','free_delivery_enabled_at','freight_fuel_manual_cents'])await setSettingFixture(key,null);});

function request(method:string,path:string,{persona,body,key}:{persona:string|null;body?:unknown;key?:boolean}){
  const headers:Record<string,string>={'content-type':'application/json'};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  if(key)headers['idempotency-key']=`d2-${Math.random().toString(36).slice(2)}`;
  return new NextRequest(`http://127.0.0.1${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
}
async function call({method,path,module,body,key}:Call,persona:string|null,params:Record<string,string>){
  const handler=(await module())[method] as Handler;
  return handler(request(method,path,{persona,body,key}),{params:Promise.resolve(params)});
}
/** Everything a write could change on the quote. */
async function snapshot(id:string){
  const {quote,quoteActivity,quoteNotes,quoteRevisions,quoteTouchClocks}=await import('@/server/repository');
  return JSON.stringify({quote:quote(id),activity:quoteActivity(id),notes:quoteNotes(id),revisions:quoteRevisions(id),clocks:quoteTouchClocks(id)});
}

/** Every rep write route on a quote, plus the two read helpers that only serve editing (Add item search, Suggested by Querent). */
const writes=(id:string,line:string):[string,Call][]=>[
  ['POST duplicate',{method:'POST',path:`/api/rep/quotes/${id}/duplicate`,module:()=>import('./duplicate/route'),key:true}],
  ['PUT freight',{method:'PUT',path:`/api/rep/quotes/${id}/freight`,module:()=>import('./freight/route'),body:{amount:40,reason:'Customer truck'}}],
  ['DELETE freight',{method:'DELETE',path:`/api/rep/quotes/${id}/freight`,module:()=>import('./freight/route')}],
  ['PATCH fulfillment',{method:'PATCH',path:`/api/rep/quotes/${id}/fulfillment`,module:()=>import('./fulfillment/route'),body:{branchId:'ogden'}}],
  ['POST lines',{method:'POST',path:`/api/rep/quotes/${id}/lines`,module:()=>import('./lines/route'),body:{itemId:'FD-45-60Z',qty:1}}],
  ['PATCH lines/<line>',{method:'PATCH',path:`/api/rep/quotes/${id}/lines/${line}`,module:()=>import('./lines/[lineId]/route'),body:{qty:3}}],
  ['DELETE lines/<line>',{method:'DELETE',path:`/api/rep/quotes/${id}/lines/${line}`,module:()=>import('./lines/[lineId]/route')}],
  ['POST notes',{method:'POST',path:`/api/rep/quotes/${id}/notes`,module:()=>import('./notes/route'),body:{body:'Looked at this'}}],
  ['POST read',{method:'POST',path:`/api/rep/quotes/${id}/read`,module:()=>import('./read/route')}],
  ['POST reset',{method:'POST',path:`/api/rep/quotes/${id}/reset`,module:()=>import('./reset/route')}],
  ['POST send',{method:'POST',path:`/api/rep/quotes/${id}/send`,module:()=>import('./send/route'),body:{revision:1,total:479},key:true}],
  ['PATCH terms',{method:'PATCH',path:`/api/rep/quotes/${id}/terms`,module:()=>import('./terms/route'),body:{customerPo:'7790'}}],
  ['POST upsells',{method:'POST',path:`/api/rep/quotes/${id}/upsells`,module:()=>import('./upsells/route'),body:{upsellId:'matching_fastener:HN-12-13-G8',fingerprint:'x'}}],
  ['GET items (Add item search)',{method:'GET',path:`/api/rep/quotes/${id}/items?q=strap`,module:()=>import('./items/route')}],
  ['GET upsells (Suggested by Querent)',{method:'GET',path:`/api/rep/quotes/${id}/upsells`,module:()=>import('./upsells/route')}],
];

describe('every write route refuses the manager on another rep’s quote (not found), changing nothing',()=>{
  it.each(writes('__id__','__line__').map(([name])=>[name]))('%s',async name=>{
    const {id,line}=marasDraft;
    const route=writes(id,line).find(([n])=>n===name)![1];
    const before=await snapshot(id);
    for(const persona of ['supplier','eli']){
      const response=await call(route,persona,{id,lineId:line});
      expect(response.status,`${persona}: ${name}`).toBe(404);
    }
    expect(await snapshot(id)).toBe(before);
  });

  it('while the owner (Mara) can still use them',async()=>{
    const {id,line}=marasDraft;
    const owner=async(name:string)=>(await call(writes(id,line).find(([n])=>n===name)![1],'mara',{id,lineId:line})).status;
    expect(await owner('PATCH terms')).toBe(200);
    expect(await owner('POST notes')).toBe(201);
    expect(await owner('PATCH lines/<line>')).toBe(200);
  });
});

describe('the manager reads any quote, read-only',()=>{
  const get=async(path:string,module:()=>Promise<Record<string,unknown>>,persona:string)=>call({method:'GET',path,module},persona,{id:marasDraft.id});

  it('GET the detail: read_only names the owner, nothing is editable, and the read neither touches nor marks it read',async()=>{
    const {quote,quoteTouchClocks}=await import('@/server/repository');
    const {id,quote_number}=marasDraft;
    const response=await get(`/api/rep/quotes/${quote_number}`,()=>import('./route'),'supplier');
    expect(response.status).toBe(200);
    const body=await response.json();
    expect(body).toMatchObject({editable:false,read_only:{rep_id:'mara',rep_name:'Mara Jensen'},quote:{quote_number,rep_id:'mara',status:'ready_for_review'}});
    // The valid-until shown is still the draft's (as if sent today), not a frozen one.
    expect(body.valid_until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(quoteTouchClocks(id)!.last_rep_touch_at).toBeNull();
    expect(quote(id)!.unread_for_rep).toBe(true);
    // Another rep: not found. The owner: editable, not read-only, and touched.
    expect((await get(`/api/rep/quotes/${id}`,()=>import('./route'),'eli')).status).toBe(404);
    const own=await (await get(`/api/rep/quotes/${id}`,()=>import('./route'),'mara')).json();
    expect(own).toMatchObject({editable:true,read_only:null});
    expect(quoteTouchClocks(id)!.last_rep_touch_at).not.toBeNull();
  });

  it('GET the chat transcript (B1 messages route)',async()=>{
    const {id}=marasDraft;
    const response=await get(`/api/rep/quotes/${id}/messages`,()=>import('./messages/route'),'supplier');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({total:1,messages:[{role:'customer',content:'Two cases of gloves, please'}]});
    expect((await get(`/api/rep/quotes/${id}/messages`,()=>import('./messages/route'),'eli')).status).toBe(404);
  });

  it('GET the customer PDF, the internal worksheet and the line-item CSV of the draft',async()=>{
    const {id}=marasDraft;
    const pdf=()=>import('@/app/api/quotes/[id]/pdf/route');
    for(const variant of ['customer','internal']){
      const response=await get(`/api/quotes/${id}/pdf?variant=${variant}&rev=draft`,pdf,'supplier');
      expect(response.status,variant).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/application\/pdf/);
      expect((await get(`/api/quotes/${id}/pdf?variant=${variant}&rev=draft`,pdf,'eli')).status).toBe(404);
    }
    const csv=await get(`/api/rep/quotes/${id}/lines.csv?rev=draft`,()=>import('./lines.csv/route'),'supplier');
    expect(csv.status).toBe(200);
    expect(await csv.text()).toMatch(/GLV-N8-L-1000/);
    expect((await get(`/api/rep/quotes/${id}/lines.csv?rev=draft`,()=>import('./lines.csv/route'),'eli')).status).toBe(404);
  });

  it('never reprices the draft on the manager’s open (only the owner’s open reprices, spec §4.5)',async()=>{
    const {createQuote,quote}=await import('@/server/repository');
    // A delivery draft for Mara's customer, over the free-delivery threshold, then free delivery pricing turned on.
    const q=createQuote({customerId:'canyon-ridge',fulfillment:'delivery',branchId:'slc',shipTo:{address:'1800 W 10950 S, South Jordan, UT 84095',lat:40.5486,lng:-111.9333},
      lines:[{itemId:'HCS-12-13-2G8',qty:50,unitPrice:31.5,priceBasis:'custom'},{itemId:'CW-45-045-T1',qty:6,unitPrice:36,priceBasis:'custom'}]});
    await setSettingFixture('free_delivery_pricing','true');
    await setSettingFixture('free_delivery_enabled_at',new Date(Date.now()-35*86_400_000).toISOString());
    await setSettingFixture('freight_fuel_manual_cents','340');
    const frozen=()=>{const s=quote(q.id)!;return {rate:s.freight_rate_bp,step:s.freight_ramp_step,modelled:s.modelled_freight_cents,recovery:s.lines.map(l=>l.freight_recovery),updated:s.updated_at};};
    const before=frozen();
    expect((await call({method:'GET',path:`/api/rep/quotes/${q.id}`,module:()=>import('./route')},'supplier',{id:q.id})).status).toBe(200);
    expect(frozen()).toEqual(before);
    expect((await call({method:'GET',path:`/api/rep/quotes/${q.id}`,module:()=>import('./route')},'mara',{id:q.id})).status).toBe(200);
    expect(frozen().rate).not.toBe(before.rate);
  });
});
