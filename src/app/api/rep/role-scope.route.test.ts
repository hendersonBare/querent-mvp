import {NextRequest} from 'next/server';
import {beforeAll,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// Role-based scope through every /api/rep route family (Appendix B; decisions 20, 22, 42; task U1).
// A rep reads only their own customers, quotes, orders and analytics; the manager reads the whole
// organization by default. There is no "All reps" switch any more: ?scope=all is ignored, never a
// 403. ?customer= is only a page-local filter, and a customer the rep can't read is ignored like an
// unknown one. Managers still open other reps' quotes read-only (decision 22).
useSeededDatabase();

const headers=(persona:string)=>({cookie:`querent-persona=${persona}`});
const get=(path:string,persona:string)=>new NextRequest(`http://127.0.0.1${path}`,{headers:headers(persona)});
const json=async(response:Response|Promise<Response>)=>{const r=await response;return {status:r.status,body:await r.json()};};
type Row={quote_number:string;rep_id:string;customer_id:string};
// The seed: Brandi (manager) has Wasatch and Great Basin; Mara has Canyon Ridge; Eli has Utah Valley Electric and Weber Basin; Nora has Uinta.
const SEEDED={brandi:31,mara:18,eli:26},ALL=SEEDED.brandi+SEEDED.mara+SEEDED.eli;
const EVERY_CUSTOMER=['canyon-ridge','great-basin','uinta-facility','utah-valley-electric','wasatch','weber-basin'];

let brandisQuote='',marasQuote='';
beforeAll(async()=>{
  const {quotes}=await import('@/server/repository');
  // Sent quotes (revision 1 or more), so the lines CSV has a revision to export.
  brandisQuote=quotes({repId:'brandi',customerId:'wasatch'}).find(q=>q.revision>0)!.quote_number;
  marasQuote=quotes({repId:'mara'}).find(q=>q.revision>0)!.quote_number;
});

describe('GET /api/rep/quotes',()=>{
  const list=async(query:string,persona:string)=>json((await import('./quotes/route')).GET(get(`/api/rep/quotes${query}`,persona)));

  it('a rep reads only their own quotes; ?scope=all is ignored, not refused',async()=>{
    for(const query of ['','?scope=all','?scope=all&rep=brandi','?team=Outside%20Sales']){
      const {status,body}=await list(query,'mara');
      expect(status).toBe(200);
      expect(body).toMatchObject({scope:'mine',manager:null,rep_filter:null,team_filter:null,counts:{all:SEEDED.mara}});
      expect(body.rows.every((r:Row)=>r.rep_id==='mara')).toBe(true);
    }
  });

  it('a rep’s ?customer= for another rep’s customer is ignored: no rows, name or flag leak out',async()=>{
    const {body}=await list('?customer=wasatch','mara');
    expect(body.customer).toBeNull();
    expect(body).not.toHaveProperty('other_rep');
    expect(body.counts.all).toBe(SEEDED.mara);
    expect(body.rows.some((r:Row)=>r.customer_id==='wasatch')).toBe(false);
  });

  it('the manager reads every rep’s quotes by default, with the rep and team filters, no switch needed',async()=>{
    const {body}=await list('','supplier');
    expect(body).toMatchObject({scope:'all',counts:{all:ALL}});
    expect(new Set(body.rows.map((r:Row)=>r.rep_id))).toEqual(new Set(['brandi','mara','eli']));
    const byRep=(await list('?rep=mara','supplier')).body;
    expect(byRep).toMatchObject({rep_filter:'mara',counts:{all:SEEDED.mara}});
    // ?scope=all changes nothing for her either.
    expect((await list('?scope=all','supplier')).body.counts.all).toBe(ALL);
    expect((await list('?customer=canyon-ridge','supplier')).body.customer).toMatchObject({id:'canyon-ridge'});
  });
});

describe('GET /api/rep/quotes/<id> and its reads',()=>{
  const detail=async(id:string,persona:string)=>(await import('./quotes/[id]/route')).GET(get(`/api/rep/quotes/${id}`,persona),{params:Promise.resolve({id})});
  const messages=async(id:string,persona:string)=>(await import('./quotes/[id]/messages/route')).GET(get(`/api/rep/quotes/${id}/messages`,persona),{params:Promise.resolve({id})});
  const csv=async(id:string,persona:string)=>(await import('./quotes/[id]/lines.csv/route')).GET(get(`/api/rep/quotes/${id}/lines.csv`,persona),{params:Promise.resolve({id})});

  it('a rep cannot read another rep’s quote, its chat or its lines',async()=>{
    expect((await detail(brandisQuote,'mara')).status).toBe(404);
    expect((await messages(brandisQuote,'mara')).status).toBe(404);
    expect((await csv(brandisQuote,'mara')).status).toBe(404);
    expect((await detail(marasQuote,'mara')).status).toBe(200);
  });

  it('the manager reads any rep’s quote read-only (decision 22)',async()=>{
    const {status,body}=await json(detail(marasQuote,'supplier'));
    expect(status).toBe(200);
    expect(body).toMatchObject({editable:false,read_only:{rep_id:'mara'}});
    expect((await messages(marasQuote,'supplier')).status).toBe(200);
    expect((await csv(marasQuote,'supplier')).status).toBe(200);
  });
});

describe('GET /api/rep/analytics',()=>{
  const analytics=async(query:string,persona:string)=>json((await import('./analytics/route')).GET(get(`/api/rep/analytics${query}`,persona)));

  it('a rep’s numbers cover only their own customers; another rep’s customer is ignored',async()=>{
    expect((await analytics('','mara')).body.scope).toEqual({customer:null,customer_ids:['canyon-ridge']});
    expect((await analytics('?customer=wasatch','mara')).body.scope).toEqual({customer:null,customer_ids:['canyon-ridge']});
    expect((await analytics('?scope=all','eli')).body.scope.customer_ids.sort()).toEqual(['utah-valley-electric','weber-basin']);
  });

  it('the manager’s numbers cover the whole organization, and any one customer',async()=>{
    expect((await analytics('','supplier')).body.scope.customer_ids.sort()).toEqual(EVERY_CUSTOMER);
    const one=(await analytics('?customer=canyon-ridge','supplier')).body.scope;
    expect(one).toMatchObject({customer:{id:'canyon-ridge'},customer_ids:['canyon-ridge']});
  });
});

describe('GET /api/rep/badges',()=>{
  const badges=async(query:string,persona:string)=>json((await import('./badges/route')).GET(get(`/api/rep/badges${query}`,persona)));
  const red=async(persona:string)=>(await (await (await import('./quotes/route')).GET(get('/api/rep/quotes?attention=1',persona))).json()).rows.filter((r:{aging:{level:string}})=>r.aging.level==='red').length;

  it('a rep’s red count is their own; ?scope=all is ignored, not refused',async()=>{
    const own=await badges('','mara');
    expect(own.status).toBe(200);
    expect(own.body.attention).toBe(await red('mara'));
    expect(await badges('?scope=all','mara')).toEqual(own);
  });

  it('the manager’s red count covers every rep; unread stays her own flag',async()=>{
    const {body}=await badges('','supplier');
    const everyRed=await red('supplier');
    expect(everyRed).toBeGreaterThan(await red('mara'));
    expect(body.attention).toBe(everyRed);
    expect((await badges('?scope=all','supplier')).body).toEqual(body);
  });
});

describe('GET /api/rep/settings',()=>{
  const settings=async(query:string,persona:string)=>json((await import('./settings/route')).GET(get(`/api/rep/settings${query}`,persona)));

  it('a rep sees only their own customers in Rep assignments, and can’t pick another rep’s for Customer access',async()=>{
    const {body}=await settings('?customer=wasatch','mara');
    expect(body.assignments.map((a:{id:string})=>a.id)).toEqual(['canyon-ridge']);
    expect(body.access.customer_id).toBeNull();
    expect((await settings('?customer=canyon-ridge','mara')).body.access.customer_id).toBe('canyon-ridge');
  });

  it('the manager sees every customer',async()=>{
    const {body}=await settings('?customer=canyon-ridge','supplier');
    expect(body.assignments.map((a:{id:string})=>a.id).sort()).toEqual(EVERY_CUSTOMER);
    expect(body.access.customer_id).toBe('canyon-ridge');
  });
});

describe('manager-only routes: team and reassignment',()=>{
  it('refuse a rep (403) and serve the manager',async()=>{
    const {GET:metrics}=await import('./team/metrics/route');
    const {GET:reps}=await import('./team/reps/route');
    const {POST:reassign}=await import('./quotes/reassign/route');
    expect((await reps(get('/api/rep/team/reps','mara'),undefined)).status).toBe(403);
    expect((await metrics(get('/api/rep/team/metrics','mara'),undefined)).status).toBe(403);
    expect((await reassign(new NextRequest('http://127.0.0.1/api/rep/quotes/reassign',{method:'POST',headers:headers('mara'),body:'{}'}),undefined)).status).toBe(403);
    expect((await reps(get('/api/rep/team/reps','supplier'),undefined)).status).toBe(200);
  });
});
