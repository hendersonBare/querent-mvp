import {NextRequest} from 'next/server';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// GET / POST /api/rep/quotes/<id>/upsells (task 3.6): "Suggested by Querent". Rep-only (401 / 403
// like the other rep routes), the rep's own quote only (404), and a chip is taken only while the
// quote is editable (409), however the request is made. Scripted mode: no Claude call here.
useSeededDatabase();

beforeEach(async()=>{vi.stubEnv('QUERENT_SCRIPTED','1');(await import('@/server/quotes/service')).resetSample();});
afterEach(()=>{vi.unstubAllEnvs();});

const call=async(method:'GET'|'POST',id:string,body?:unknown,persona:string|null='supplier')=>{
  const route=await import('./route');
  const headers:Record<string,string>={'content-type':'application/json'};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  const request=new NextRequest(`http://127.0.0.1/api/rep/quotes/${id}/upsells`,{method,headers,body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
  return route[method](request,{params:Promise.resolve({id})});
};
/** Taking the nut as GET shows it on the sample (its id and fingerprint). */
const NUT={upsellId:'matching_fastener:HN-12-13-G8',fingerprint:'matching_fastener:HN-12-13-G8|add 5|19.95'};
const WHEELS={upsellId:'full_case:CW-45-045-T1',fingerprint:'full_case:CW-45-045-T1|q-24817-2 6->8|36.00'};

it('refuses visitors (401) and customers (403), and takes nothing',async()=>{
  const {quote}=await import('@/server/repository');
  expect((await call('GET','Q-24817',undefined,null)).status).toBe(401);
  expect((await call('POST','Q-24817',NUT,null)).status).toBe(401);
  const customer=await call('GET','Q-24817',undefined,'customer');
  expect(customer.status).toBe(403);
  expect(await customer.json()).toEqual({detail:'Supplier access required.'});
  expect((await call('POST','Q-24817',NUT,'customer')).status).toBe(403);
  expect(quote('q-24817')!.lines).toHaveLength(4);
});

it('lists the five chips on the sample, never cached, with the template wording in scripted mode',async()=>{
  const response=await call('GET','Q-24817');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toMatch(/no-store/);
  const body=await response.json();
  expect(body).toMatchObject({quote_id:'q-24817',editable:true});
  expect(body.upsells.map((u:{id:string;wording_source:string})=>[u.id,u.wording_source])).toEqual([
    ['matching_fastener:HN-12-13-G8','template'],['matching_fastener:FW-12-G8','template'],['bought_together:FD-45-60Z','template'],
    ['full_case:CW-45-045-T1','template'],['bought_together:SG-CLR-AF','template'],
  ]);
  expect(body.upsells[0].fingerprint).toBe(NUT.fingerprint);
  expect(body.upsells[3].fingerprint).toBe(WHEELS.fingerprint);
});

it('takes a chip and answers the fresh detail with the new line; the chip is gone from the list',async()=>{
  const response=await call('POST','Q-24817',NUT);
  expect(response.status).toBe(200);
  const body=await response.json();
  expect(body).toMatchObject({upsell_id:NUT.upsellId,line_id:'q-24817-5'});
  expect(body.detail.lines.at(-1)).toMatchObject({id:'q-24817-5',sku:'HN-12-13-G8',qty:5,added_by:'upsell'});
  const ids=(await (await call('GET','Q-24817')).json()).upsells.map((u:{id:string})=>u.id);
  expect(ids).not.toContain(NUT.upsellId);
  const again=await call('POST','Q-24817',NUT);
  expect(again.status).toBe(409);
  expect(await again.json()).toEqual({detail:'That suggestion no longer applies to Q-24817.',code:'conflict'});
});

it('validates the body (400)',async()=>{
  for(const body of [{},{upsellId:''},{upsellId:3},{upsellId:NUT.upsellId},{...NUT,qty:50},{...NUT,unitPrice:0.01},'not json']){
    const response=await call('POST','Q-24817',body);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('invalid_input');
  }
});

it('offers nothing on an accepted quote and refuses to take a chip there (409), leaving it as it was',async()=>{
  const {quoteByNumber}=await import('@/server/repository');
  const accepted=quoteByNumber('Q-24816')!;
  expect(await (await call('GET','Q-24816')).json()).toEqual({quote_id:accepted.id,editable:false,upsells:[]});
  const take=await call('POST','Q-24816',WHEELS);
  expect(take.status).toBe(409);
  expect(await take.json()).toEqual({detail:'Q-24816 was accepted, so it can\'t be edited. Duplicate it to quote again.',code:'illegal_transition'});
  expect(quoteByNumber('Q-24816')).toEqual(accepted);
});

it('answers 404 for another rep’s quote and an unknown one',async()=>{
  const {createQuote,quote}=await import('@/server/repository');
  const other=createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'HCS-12-13-2G8',qty:3,unitPrice:30}]});
  expect((await call('GET',other.quote_number)).status).toBe(404);
  const take=await call('POST',other.quote_number,NUT);
  expect(take.status).toBe(404);
  expect(quote(other.id)!.lines).toHaveLength(1);
  expect((await call('GET','Q-99999')).status).toBe(404);
  expect((await call('POST','Q-99999',NUT)).status).toBe(404);
});

it('refuses a chip that changed since it was shown (409) instead of applying its new values (verifier F1)',async()=>{
  const {quote}=await import('@/server/repository');
  const lineRoute=await import('../lines/[lineId]/route');
  const {NextRequest:Request}=await import('next/server');
  const patch=(lineId:string,qty:number)=>lineRoute.PATCH(new Request(`http://127.0.0.1/api/rep/quotes/Q-24817/lines/${lineId}`,{method:'PATCH',
    headers:{'content-type':'application/json',cookie:'querent-persona=supplier'},body:JSON.stringify({qty})}),{params:Promise.resolve({id:'Q-24817',lineId})});
  // The chips as shown (wheels 6 -> 8, nut 5 at $19.95); then, in another tab, the wheels go to 9 and the bolts to 20.
  expect((await patch('q-24817-2',9)).status).toBe(200);
  expect((await patch('q-24817-1',20)).status).toBe(200);
  const lines=quote('q-24817')!.lines;
  for(const body of [WHEELS,NUT]){
    const response=await call('POST','Q-24817',body);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({detail:'That suggestion changed since it was shown. Check the updated suggestions and try again.',code:'conflict'});
  }
  expect(quote('q-24817')!.lines).toEqual(lines);
  // The list now shows what they mean on the quote as it is.
  const now=(await (await call('GET','Q-24817')).json()).upsells.map((u:{fingerprint:string})=>u.fingerprint);
  expect(now).toEqual(expect.arrayContaining(['full_case:CW-45-045-T1|q-24817-2 9->12|36.00','matching_fastener:HN-12-13-G8|add 10|16.50']));
});
