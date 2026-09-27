import {NextRequest} from 'next/server';
import {beforeEach,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// POST /api/rep/quotes/<id or number>/reset (task 3.5): the ⋯ menu's Reset sample quote.
// Rep-only (401 / 403), the rep's own quote only (404), and the sample only (409).
useSeededDatabase();

const post=async(id:string,persona:string|null='supplier')=>{
  const {POST}=await import('./route');
  return POST(new NextRequest(`http://127.0.0.1/api/rep/quotes/${id}/reset`,{method:'POST',headers:persona?{cookie:`querent-persona=${persona}`}:{}}),{params:Promise.resolve({id})});
};

beforeEach(async()=>{(await import('@/server/quotes/service')).resetSample();});

it('refuses visitors (401) and customers (403) before touching the sample',async()=>{
  const {quote,updateQuoteLine}=await import('@/server/repository');
  updateQuoteLine('q-24817','q-24817-1',{unitPrice:22,priceBasis:'custom'});
  const edited=quote('q-24817');
  expect((await post('Q-24817',null)).status).toBe(401);
  const customer=await post('Q-24817','customer');
  expect(customer.status).toBe(403);
  expect(await customer.json()).toEqual({detail:'Supplier access required.'});
  expect(quote('q-24817')).toEqual(edited);
});

it('rebuilds the sample as seeded and answers its fresh detail, never cached',async()=>{
  const {quote,updateQuoteLine,removeQuoteLine}=await import('@/server/repository');
  updateQuoteLine('q-24817','q-24817-1',{unitPrice:22,priceBasis:'custom'});
  removeQuoteLine('q-24817','q-24817-4');
  const response=await post('Q-24817');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toMatch(/no-store/);
  const detail=await response.json();
  expect(detail.quote).toMatchObject({quote_number:'Q-24817',status:'ready_for_review',is_sample:true});
  expect(detail.lines.map((l:{sku:string;unit_price:number})=>[l.sku,l.unit_price])).toEqual([['HCS-12-13-2G8',31.5],['CW-45-045-T1',36],['GLV-N8-L-1000',79],['RS-2-27-JH',22.95]]);
  expect(quote('q-24817')!.lines).toHaveLength(4);
});

it('refuses any quote but the sample (409), and another rep’s or an unknown quote (404)',async()=>{
  const {createQuote,quoteByNumber}=await import('@/server/repository');
  const accepted=quoteByNumber('Q-24816');
  const refused=await post('Q-24816');
  expect(refused.status).toBe(409);
  expect(await refused.json()).toEqual({detail:'Only the sample quote can be reset. Q-24816 isn’t sample data.',code:'illegal_transition'});
  expect(quoteByNumber('Q-24816')).toEqual(accepted);
  const other=createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'GLV-N8-L-1000',qty:1,unitPrice:82}]});
  expect((await post(other.quote_number)).status).toBe(404);
  expect((await post('Q-99999')).status).toBe(404);
});
