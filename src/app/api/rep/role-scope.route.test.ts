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

  it('a rep’s numbers cover only their own quotes and customers; another rep’s customer is ignored',async()=>{
    expect((await analytics('','mara')).body.scope).toEqual({customer:null,customer_ids:['canyon-ridge'],rep_id:'mara'});
    expect((await analytics('?customer=wasatch','mara')).body.scope).toEqual({customer:null,customer_ids:['canyon-ridge'],rep_id:'mara'});
    expect((await analytics('?scope=all','eli')).body.scope.customer_ids.sort()).toEqual(['utah-valley-electric','weber-basin']);
  });

  it('the manager’s numbers cover the whole organization, and any one customer',async()=>{
    expect((await analytics('','supplier')).body.scope.customer_ids.sort()).toEqual(EVERY_CUSTOMER);
    expect((await analytics('','supplier')).body.scope.rep_id).toBeNull();
    const one=(await analytics('?customer=canyon-ridge','supplier')).body.scope;
    expect(one).toMatchObject({customer:{id:'canyon-ridge'},customer_ids:['canyon-ridge']});
  });

  // A rep's quote numbers are the quotes they own (quotes.rep_id), the same quotes as their Quotes
  // list, whoever the customer is assigned to (Appendix B "own data"; OA-67). The seed has the
  // fixture: Brandi owns 3 accepted and Eli 2 open quotes on Mara's customer Canyon Ridge.
  const list=async(query:string,persona:string)=>(await json((await import('./quotes/route')).GET(get(`/api/rep/quotes${query}`,persona)))).body;
  type ListRow=Row&{status:string;total:number|null};
  const cents=(n:number)=>Math.round(n*100);
  /** The analytics for `persona` (and `query`) count exactly the quotes in their Quotes list for the same query. */
  const expectOwnNumbers=async(persona:string,query='')=>{
    const quotes=await list(query,persona),numbers=(await analytics(query,persona)).body;
    const accepted=quotes.rows.filter((r:ListRow)=>r.status==='accepted');
    const {won,lost,open}=numbers.win_rate;
    expect({quotes:won+lost+open,won,lost}).toEqual({quotes:quotes.counts.all,won:quotes.counts.accepted,lost:quotes.counts.expired+quotes.counts.declined});
    expect(numbers.quoted.accepted_count).toBe(quotes.counts.accepted);
    expect(cents(numbers.quoted.accepted)).toBe(accepted.reduce((sum:number,r:ListRow)=>sum+cents(r.total!),0));
    return {quotes,numbers};
  };

  it('a rep’s win rate, quotes and accepted revenue are the quotes they own, matching their Quotes list',async()=>{
    const mara=await expectOwnNumbers('mara');
    expect(mara.quotes.counts).toMatchObject({all:18,accepted:9});
    // Brandi's 3 accepted Canyon Ridge quotes are hers, not Mara's.
    expect(mara.numbers.win_rate.won).toBe(9);
    // Eli's 2 Canyon Ridge quotes are his: they count for him, though the customer is Mara's.
    const eli=await expectOwnNumbers('eli');
    expect(eli.quotes.counts.all).toBe(26);
    expect(eli.quotes.rows.filter((r:ListRow)=>r.customer_id==='canyon-ridge')).toHaveLength(2);
    // The page's own customer filter narrows the rep's own quotes.
    await expectOwnNumbers('mara','?customer=canyon-ridge');
    await expectOwnNumbers('eli','?customer=weber-basin');
  });

  it('the manager’s numbers count every rep’s quotes',async()=>{
    const all=await expectOwnNumbers('supplier');
    expect(all.quotes.counts.all).toBe(ALL);
    await expectOwnNumbers('supplier','?customer=canyon-ridge');
  });

  it('a quote reassigned to a rep for another rep’s customer counts for its new owner, not the customer’s rep',async()=>{
    const {quotes:repoQuotes,setQuoteRep}=await import('@/server/repository');
    const moved=repoQuotes({repId:'brandi',customerId:'wasatch'}).find(q=>q.status==='accepted')!;
    const brandiAccepted=(await list('?rep=brandi','supplier')).counts.accepted;
    expect(setQuoteRep(moved.id,'mara')).toBe(true);
    try{
      const mara=await expectOwnNumbers('mara');
      expect(mara.quotes.counts).toMatchObject({all:19,accepted:10});
      expect(mara.quotes.rows.some((r:ListRow)=>r.customer_id==='wasatch')).toBe(true);
      // Wasatch is still Brandi's customer: Mara's filter can't name it, so it reads as All customers.
      expect((await analytics('?customer=wasatch','mara')).body.win_rate).toEqual(mara.numbers.win_rate);
      expect((await list('?rep=brandi','supplier')).counts.accepted).toBe(brandiAccepted-1);
      await expectOwnNumbers('supplier');
    }finally{
      setQuoteRep(moved.id,'brandi');
    }
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

  it('a rep gets only their own floors: no customer access summary, no other rep’s floors (plan U8, OA-69)',async()=>{
    for(const query of ['','?customer=wasatch','?customer=canyon-ridge']){
      const {body}=await settings(query,'mara');
      expect(body).toEqual({rep_id:'mara',manager:null,mine:expect.objectContaining({rep:expect.objectContaining({id:'mara'})}),
        own:{orgFloors:expect.any(Array),profile:expect.objectContaining({name:'Mara Jensen'}),notifications:expect.any(Object)}});
    }
    expect((await (await import('./settings/access/route')).GET(get('/api/rep/settings/access','mara'))).status).toBe(403);
    expect((await (await import('./settings/sources/route')).GET(get('/api/rep/settings/sources','mara'))).status).toBe(403);
    expect((await (await import('./settings/margins/route')).GET(get('/api/rep/settings/margins','mara'))).status).toBe(403);
  });

  it('the manager sees every customer',async()=>{
    expect((await settings('?customer=canyon-ridge','supplier')).body.manager.accessTable.customers.map((c:{id:string})=>c.id)).toEqual(['canyon-ridge']);
    const {body}=await json((await import('./settings/access/route')).GET(get('/api/rep/settings/access','supplier')));
    expect(body.customers.map((c:{id:string})=>c.id).sort()).toEqual(EVERY_CUSTOMER);
  });
});

describe('manager-only routes: teams, reps, reassignment and the leaderboard CSV',()=>{
  it('refuse a rep (403) and serve the manager',async()=>{
    const {GET:reps}=await import('./team/reps/route');
    const {GET:teams}=await import('./teams/route');
    const {GET:leaderboard}=await import('./analytics/csv/route');
    const {POST:reassign}=await import('./quotes/reassign/route');
    expect((await reps(get('/api/rep/team/reps','mara'),undefined)).status).toBe(403);
    expect((await teams(get('/api/rep/teams','mara'))).status).toBe(403);
    expect((await leaderboard(get('/api/rep/analytics/csv','mara'))).status).toBe(403);
    expect((await reassign(new NextRequest('http://127.0.0.1/api/rep/quotes/reassign',{method:'POST',headers:headers('mara'),body:'{}'}),undefined)).status).toBe(403);
    expect((await reps(get('/api/rep/team/reps','supplier'),undefined)).status).toBe(200);
    expect((await teams(get('/api/rep/teams','supplier'))).status).toBe(200);
    expect((await leaderboard(get('/api/rep/analytics/csv','supplier'))).status).toBe(200);
  });

  it('the D3 Team metrics routes are gone (U11): Analytics serves their numbers',async()=>{
    const {existsSync}=await import('node:fs');
    const {join}=await import('node:path');
    for(const route of ['team/metrics','team/metrics.csv'])expect(existsSync(join(__dirname,route,'route.ts')),route).toBe(false);
  });
});

// The routes added in U3 to U9 key every read and write on the session's rep, never on the request
// (Appendix B "own data"): what one rep stores, another rep cannot read through them.
describe('per-rep routes from U3 to U9: a rep reads only their own record',()=>{
  const send=(path:string,persona:string,method:string,body:BodyInit,type='application/json')=>
    new NextRequest(`http://127.0.0.1${path}`,{method,headers:{...headers(persona),'content-type':type},body});

  it('profile: Eli\'s name, phone and email never reach Mara, whatever the query names',async()=>{
    const route=await import('./profile/route');
    expect((await route.PUT(send('/api/rep/profile','eli','PUT',JSON.stringify({name:'Eli Porter',phone:'(801) 555-0199',email:'eli.private@example.com'})))).status).toBe(200);
    for(const query of ['','?rep=eli','?rep_id=eli']){
      const {status,body}=await json(route.GET(get(`/api/rep/profile${query}`,'mara')));
      expect(status).toBe(200);
      expect(body).toMatchObject({name:'Mara Jensen'});
      expect(JSON.stringify(body)).not.toContain('eli.private@example.com');
    }
  });

  it('profile picture: Eli\'s picture is served to Eli only; Mara gets her own (none)',async()=>{
    const {readFileSync}=await import('node:fs');
    const {join}=await import('node:path');
    const route=await import('./profile/picture/route');
    const png=new Uint8Array(readFileSync(join(process.cwd(),'test/fixtures/pictures/tiny.png')));
    expect((await route.PUT(send('/api/rep/profile/picture','eli','PUT',png,'image/png'))).status).toBe(200);
    expect((await route.GET(get('/api/rep/profile/picture','eli'))).status).toBe(200);
    expect((await route.GET(get('/api/rep/profile/picture?rep=eli','mara'))).status).toBe(404);
    expect((await route.DELETE(get('/api/rep/profile/picture','eli'))).status).toBe(200);
  });

  it('notification prefs: Eli\'s switches are his; Mara\'s stay her own',async()=>{
    const route=await import('./notification-prefs/route');
    const before=(await json(route.GET(get('/api/rep/notification-prefs','mara')))).body;
    expect((await route.PUT(send('/api/rep/notification-prefs','eli','PUT',JSON.stringify({quote_overdue:false,quote_accepted:false})))).status).toBe(200);
    expect((await json(route.GET(get('/api/rep/notification-prefs?rep=eli','mara')))).body).toEqual(before);
    expect((await json(route.GET(get('/api/rep/notification-prefs','eli')))).body).toMatchObject({quote_overdue:false,quote_accepted:false});
  });

  it('table prefs: Eli\'s column order is his; Mara reads her own (none)',async()=>{
    const route=await import('./table-prefs/route');
    const prefs={table_id:'customers',column_order:['customer','rep','terms'],hidden_columns:['orders']};
    expect((await route.PUT(send('/api/rep/table-prefs','eli','PUT',JSON.stringify(prefs)))).status).toBe(200);
    expect((await json(route.GET(get('/api/rep/table-prefs?table=customers','eli')))).body).toMatchObject({prefs:{column_order:prefs.column_order}});
    expect((await json(route.GET(get('/api/rep/table-prefs?table=customers&user=eli','mara')))).body).toMatchObject({prefs:null});
  });

  it('quote writes from the new pages (reply, add a line) answer 404 on another rep\'s quote, writing nothing',async()=>{
    const {quoteActivity,quoteByNumber}=await import('@/server/repository');
    const target=quoteByNumber('Q-24790')!;
    const activity=quoteActivity(target.id).length;
    const reply=(await import('./quotes/[id]/reply/route')).POST;
    const lines=(await import('./quotes/[id]/lines/route')).POST;
    const context={params:Promise.resolve({id:'Q-24790'})};
    expect((await reply(send('/api/rep/quotes/Q-24790/reply','mara','POST',JSON.stringify({body:'Hello'})),context)).status).toBe(404);
    expect((await lines(send('/api/rep/quotes/Q-24790/lines','mara','POST',JSON.stringify({itemId:'GLV-N8-L-1000',qty:1})),context)).status).toBe(404);
    expect(quoteActivity(target.id)).toHaveLength(activity);
  });
});
