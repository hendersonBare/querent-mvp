import {NextRequest} from 'next/server';
import {expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// PATCH / DELETE /api/rep/quotes/<id>/lines/<lineId> (task 3.3): the rep's autosaved line edits.
// Rep-only (401 / 403 like 3.2's routes), the rep's own quote only (404), and never on a quote
// whose status doesn't allow edits (409), however the request is made.
useSeededDatabase();

const call=async(method:'PATCH'|'DELETE',id:string,lineId:string,body?:unknown,persona:string|null='supplier')=>{
  const route=await import('./route');
  const headers:Record<string,string>={'content-type':'application/json'};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  const request=new NextRequest(`http://127.0.0.1/api/rep/quotes/${id}/lines/${lineId}`,{method,headers,body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
  return route[method](request,{params:Promise.resolve({id,lineId})});
};

it('refuses visitors (401) and customers (403) before touching the line',async()=>{
  const {quote}=await import('@/server/repository');
  expect((await call('PATCH','Q-24817','q-24817-1',{unitPrice:1},null)).status).toBe(401);
  const customer=await call('PATCH','Q-24817','q-24817-1',{unitPrice:1},'customer');
  expect(customer.status).toBe(403);
  expect(await customer.json()).toEqual({detail:'Supplier access required.'});
  expect((await call('DELETE','Q-24817','q-24817-1',undefined,'customer')).status).toBe(403);
  expect(quote('q-24817')!.lines[0]).toMatchObject({unit_price:31.5,price_basis:'last_paid'});
  expect(quote('q-24817')!.lines).toHaveLength(4);
});

it('saves a price-basis switch and answers the fresh detail, never cached',async()=>{
  const response=await call('PATCH','Q-24817','q-24817-1',{basis:'list'});
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toMatch(/no-store/);
  const detail=await response.json();
  expect(detail.lines[0]).toMatchObject({unit_price:38.95,price_basis:'list'});
  expect(detail.send_check.subtotal).toBe(1196.9);
});

it('validates typed prices server-side (400), whatever the client sent',async()=>{
  for(const body of [{unitPrice:-5},{unitPrice:12.345},{unitPrice:'12'},{qty:1.5},{},'not json']){
    const response=await call('PATCH','Q-24817','q-24817-1',body);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('invalid_input');
  }
});

it('refuses a direct edit of an accepted quote (409) and leaves it as it was',async()=>{
  const {quoteByNumber}=await import('@/server/repository');
  const accepted=quoteByNumber('Q-24816')!;
  expect(accepted.status).toBe('accepted');
  const lineId=accepted.lines[0].id;
  const edit=await call('PATCH','Q-24816',lineId,{unitPrice:0.01});
  expect(edit.status).toBe(409);
  expect(await edit.json()).toEqual({detail:'Q-24816 was accepted, so it can\'t be edited. Duplicate it to quote again.',code:'illegal_transition'});
  expect((await call('DELETE','Q-24816',lineId)).status).toBe(409);
  expect(quoteByNumber('Q-24816')).toEqual(accepted);
});

it('answers 404 for another rep’s quote and an unknown line',async()=>{
  const {createQuote,quote}=await import('@/server/repository');
  const other=createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'GLV-N8-L-1000',qty:1,unitPrice:82}]});
  const response=await call('PATCH',other.quote_number,other.lines[0].id,{qty:3});
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({detail:`No quote ${other.quote_number}.`,code:'not_found'});
  expect(quote(other.id)!.lines[0].qty).toBe(1);
  expect((await call('DELETE','Q-24817','q-24817-99')).status).toBe(404);
});

it('removes a line',async()=>{
  const response=await call('DELETE','Q-24817','q-24817-4');
  expect(response.status).toBe(200);
  expect((await response.json()).lines.map((l:{sku:string})=>l.sku)).not.toContain('RS-2-27-JH');
});
