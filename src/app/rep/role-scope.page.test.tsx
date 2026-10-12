import type {ReactElement} from 'react';
import {beforeAll,describe,expect,it,vi} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// Role-based scope through every rep server page read (Appendix B; decisions 20, 22, 42; task U1).
// Each page reads its data on the server for the signed-in rep: a rep reads only their own
// customers, quotes and orders; the manager reads the whole organization. ?scope=all is ignored and
// ?customer= is only the page's own filter: a customer the rep can't read is ignored, never shown.
useSeededDatabase();

let persona='mara';
vi.mock('next/headers',()=>({cookies:async()=>({get:(name:string)=>name==='querent-persona'?{name,value:persona}:undefined})}));

type Props=Record<string,any>;
type SearchParams=Record<string,string>;
const as=(who:string)=>{persona=who;};
const props=(element:unknown)=>(element as ReactElement<Props>).props;
const search=(params:SearchParams={})=>({searchParams:Promise.resolve(params)});
const routeParams=(id:string,params:SearchParams={})=>({params:Promise.resolve({id}),searchParams:Promise.resolve(params)});
/** The digest Next's notFound() and redirect() throw with. */
async function thrown(render:()=>Promise<unknown>):Promise<string>{
  try{await render();}catch(error){return String((error as {digest?:string}).digest);}
  return 'rendered';
}
const NOT_FOUND='NEXT_HTTP_ERROR_FALLBACK;404';

const SEEDED={brandi:31,mara:18,eli:26},ALL=SEEDED.brandi+SEEDED.mara+SEEDED.eli;
let wasatchOrder='',wasatchSku='',brandisQuote='',marasQuote='';
beforeAll(async()=>{
  const {allOrders,findOrder,quotes}=await import('@/server/repository');
  wasatchOrder=allOrders({customerId:'wasatch'})[0].order_number;
  wasatchSku=findOrder(wasatchOrder)!.lines[0].sku;
  brandisQuote=quotes({repId:'brandi',customerId:'wasatch'})[0].quote_number;
  marasQuote=quotes({repId:'mara'})[0].quote_number;
});

describe('/rep/quotes',()=>{
  const page=async(params:SearchParams={})=>props(await (await import('./quotes/page')).default(search(params))).initial;
  it('a rep reads only their own quotes, whatever ?scope= or ?customer= say',async()=>{
    as('mara');
    for(const params of [{},{scope:'all'},{customer:'wasatch'},{scope:'all',rep:'brandi'}] as SearchParams[]){
      const list=await page(params);
      expect(list).toMatchObject({scope:'mine',customer:null,counts:{all:SEEDED.mara}});
      expect(list.rows.every((r:{rep_id:string})=>r.rep_id==='mara')).toBe(true);
    }
  });
  it('the manager reads every rep’s quotes by default',async()=>{
    as('supplier');
    const list=await page();
    expect(list).toMatchObject({scope:'all',counts:{all:ALL}});
    expect((await page({rep:'eli'})).counts.all).toBe(SEEDED.eli);
  });
});

describe('/rep/quotes/[id]',()=>{
  const page=async(id:string)=>props(await (await import('./quotes/[id]/page')).default({params:Promise.resolve({id})})).initial;
  it('a rep cannot open another rep’s quote',async()=>{
    as('mara');
    expect(await thrown(()=>page(brandisQuote))).toBe(NOT_FOUND);
    expect((await page(marasQuote)).quote.rep_id).toBe('mara');
  });
  it('the manager opens any quote read-only (decision 22)',async()=>{
    as('supplier');
    expect(await page(marasQuote)).toMatchObject({editable:false,read_only:{rep_id:'mara'}});
  });
});

describe('/rep/customers',()=>{
  const page=async(params:SearchParams={})=>props(await (await import('./customers/page')).default(search(params))).rows as {id:string}[];
  it('a rep reads only their own customers; another rep’s ?customer= is ignored',async()=>{
    as('mara');
    expect((await page()).map(c=>c.id)).toEqual(['canyon-ridge']);
    expect((await page({customer:'wasatch'})).map(c=>c.id)).toEqual(['canyon-ridge']);
    as('eli');
    expect((await page()).map(c=>c.id).sort()).toEqual(['utah-valley-electric','weber-basin']);
  });
  it('the manager reads every customer, and ?customer= narrows the page',async()=>{
    as('supplier');
    expect(await page()).toHaveLength(6);
    expect((await page({customer:'canyon-ridge'})).map(c=>c.id)).toEqual(['canyon-ridge']);
  });
});

describe('/rep/customers/[id]',()=>{
  const page=async(id:string,params:SearchParams={})=>props(await (await import('./customers/[id]/page')).default(routeParams(id,params))).view;
  it('a rep cannot open another rep’s customer',async()=>{
    as('mara');
    expect(await thrown(()=>page('wasatch'))).toBe(NOT_FOUND);
    expect((await page('canyon-ridge')).account.id).toBe('canyon-ridge');
    // ?customer= no longer redirects a detail page to another customer.
    expect((await page('canyon-ridge',{customer:'wasatch'})).account.id).toBe('canyon-ridge');
  });
  it('the manager opens any customer',async()=>{
    as('supplier');
    expect((await page('canyon-ridge')).account.id).toBe('canyon-ridge');
    expect((await page('wasatch')).orders.count).toBeGreaterThan(0);
  });
});

describe('/rep/orders',()=>{
  const page=async(params:SearchParams={})=>props(await (await import('./orders/page')).default(search(params))).rows as {customer_id:string}[];
  it('a rep reads only their own customers’ orders',async()=>{
    as('mara');
    expect(await page()).toEqual([]);
    expect(await page({customer:'wasatch'})).toEqual([]);
  });
  it('the manager reads every order',async()=>{
    as('supplier');
    const rows=await page();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r=>r.customer_id==='wasatch')).toBe(true);
  });
});

describe('/rep/orders/[id]',()=>{
  const page=async(id:string)=>props(await (await import('./orders/[id]/page')).default(routeParams(id))).order;
  it('a rep cannot open another rep’s customer’s order',async()=>{
    as('mara');
    expect(await thrown(()=>page(wasatchOrder))).toBe(NOT_FOUND);
  });
  it('the manager opens any order',async()=>{
    as('supplier');
    expect((await page(wasatchOrder)).order_number).toBe(wasatchOrder);
  });
});

describe('/rep/stock/[id]',()=>{
  const page=async(id:string)=>props(await (await import('./stock/[id]/page')).default(routeParams(id))).view;
  it('a rep sees the item but only their own customers’ sales of it',async()=>{
    as('mara');
    const view=await page(wasatchSku);
    expect(view.item.sku).toBe(wasatchSku);
    expect(view.sales).toEqual([]);
  });
  it('the manager sees every customer’s sales',async()=>{
    as('supplier');
    expect((await page(wasatchSku)).sales.length).toBeGreaterThan(0);
  });
});

describe('/rep/settings',()=>{
  const page=async(params:SearchParams={})=>props(await (await import('./settings/page')).default(search(params))).initial;
  it('a rep reads only their own customers’ assignments and access',async()=>{
    as('mara');
    const settings=await page({customer:'wasatch'});
    expect(settings.assignments.map((a:{id:string})=>a.id)).toEqual(['canyon-ridge']);
    expect(settings.access.customer_id).toBeNull();
  });
  it('the manager reads every customer',async()=>{
    as('supplier');
    expect((await page({customer:'wasatch'})).assignments).toHaveLength(6);
  });
});

describe('/rep/teams and /rep',()=>{
  it('a rep has no Teams and Reps page',async()=>{
    as('mara');
    expect(await thrown(async()=>(await import('./teams/page')).default())).toBe('NEXT_REDIRECT;replace;/rep/quotes;307;');
  });
  it('/rep opens Quotes without carrying ?customer=',async()=>{
    as('mara');
    expect(await thrown(async()=>(await import('./page')).default())).toBe('NEXT_REDIRECT;replace;/rep/quotes;307;');
  });
});
