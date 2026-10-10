import {NextRequest} from 'next/server';
import {beforeAll,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// The manager's All reps scope (v3 spec §3, §5, §6 Quotes list; decision 22; OA-52; task D2):
// GET /api/rep/quotes?scope=all&rep=<id>&team=<label> lists every rep's quotes with the rep on each
// row, filtered by rep or team label; the Needs attention view and the header's red badge
// (GET /api/rep/badges?scope=all) follow the scope. A rep asking for scope=all gets 403; a rep's
// list is still their own quotes only.
useSeededDatabase();

const HOUR=3_600_000;
const ago=(hours:number)=>new Date(Date.now()-hours*HOUR).toISOString();
const headers=(persona:string)=>({cookie:`querent-persona=${persona}`});
const list=async(query='',persona='supplier')=>(await import('./route')).GET(new NextRequest(`http://127.0.0.1/api/rep/quotes${query}`,{headers:headers(persona)}));
const badges=async(query='',persona='supplier')=>(await import('../badges/route')).GET(new NextRequest(`http://127.0.0.1/api/rep/badges${query}`,{headers:headers(persona)}));
type Row={quote_number:string;rep_id:string;rep_name:string;unread:boolean};
// The seed: Brandi's 31 (Wasatch's 28 and three of Mara's she covered), Mara's 18 and Eli's 26 (the demo book, task F1), and the three made below.
const SEEDED={brandi:31,mara:18,eli:26},ALL=SEEDED.brandi+SEEDED.mara+SEEDED.eli+3;

let mara={fresh:'',overdue:''},nora='';
beforeAll(async()=>{
  const {createQuote}=await import('@/server/repository');
  const lines=[{itemId:'GLV-N8-L-1000',qty:2,unitPrice:82,priceBasis:'custom' as const}];
  // Mara (Canyon Ridge): a fresh draft and one waiting 30 hours (Overdue). Nora (Uinta): a draft waiting 5 hours (Aging).
  mara={fresh:createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines}).quote_number,
    overdue:createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines,at:ago(30)}).quote_number};
  nora=createQuote({customerId:'uinta-facility',fulfillment:'will_call',branchId:'slc',lines,at:ago(5)}).quote_number;
});

describe('GET /api/rep/quotes?scope=all (manager)',()=>{
  it('lists every rep’s quotes with the rep on each row, and the reps and teams to filter by',async()=>{
    const response=await list('?scope=all');
    expect(response.status).toBe(200);
    const body=await response.json();
    expect(body).toMatchObject({scope:'all',rep_filter:null,team_filter:null,counts:{all:ALL}});
    expect(body.rows).toHaveLength(ALL);
    expect(body.rows.find((r:Row)=>r.quote_number===mara.fresh)).toMatchObject({rep_id:'mara',rep_name:'Mara Jensen',unread:false});
    expect(body.rows.find((r:Row)=>r.quote_number===nora)).toMatchObject({rep_id:'nora',rep_name:'Nora Chen'});
    expect(body.manager.reps.map((r:{id:string;name:string;team:string|null;active:boolean})=>[r.id,r.team,r.active])).toEqual([
      ['brandi','Inside Sales',true],['eli','Outside Sales',true],['mara','Inside Sales',true],['nora','Outside Sales',true]]);
    expect(body.manager.teams).toEqual(['Inside Sales','Outside Sales']);
    // Unread is each owner's flag: the manager's count and dots are her own quotes only.
    expect(body.unread).toBe(1);
  });

  it('filters by rep and by team label; unknown values read as every rep or team',async()=>{
    const byRep=await (await list('?scope=all&rep=mara')).json();
    expect(byRep).toMatchObject({rep_filter:'mara',counts:{all:SEEDED.mara+2}});
    expect(byRep.rows.map((r:Row)=>r.quote_number)).toEqual(expect.arrayContaining([mara.fresh,mara.overdue]));
    expect(byRep.rows.every((r:Row)=>r.rep_id==='mara')).toBe(true);
    const byTeam=await (await list(`?scope=all&team=${encodeURIComponent('Outside Sales')}`)).json();
    expect(byTeam).toMatchObject({team_filter:'Outside Sales',counts:{all:SEEDED.eli+1}});
    expect(byTeam.rows.map((r:Row)=>r.quote_number)).toContain(nora);
    expect(new Set(byTeam.rows.map((r:Row)=>r.rep_id))).toEqual(new Set(['eli','nora']));
    const inside=await (await list(`?scope=all&team=${encodeURIComponent('Inside Sales')}`)).json();
    expect(new Set(inside.rows.map((r:Row)=>r.rep_id))).toEqual(new Set(['brandi','mara']));
    const unknown=await (await list('?scope=all&rep=nobody&team=Nowhere')).json();
    expect(unknown).toMatchObject({rep_filter:null,team_filter:null,counts:{all:ALL}});
  });

  it('runs the Needs attention view over every rep, red first',async()=>{
    const body=await (await list('?scope=all&attention=1')).json();
    const numbers=body.rows.map((r:Row)=>r.quote_number);
    expect(numbers).toContain(mara.overdue);
    expect(numbers).toContain(nora);
    expect(numbers).not.toContain(mara.fresh);
    expect(body.attention_count).toBe(body.rows.length);
    const levels=body.rows.map((r:{aging:{level:string}})=>r.aging.level);
    expect(levels).toEqual([...levels].sort((a:string,b:string)=>(a==='red'?0:1)-(b==='red'?0:1)));
    const mine=await (await list('?attention=1')).json();
    expect(mine.rows.every((r:Row)=>r.rep_id==='brandi')).toBe(true);
    expect(body.rows.filter((r:Row)=>r.rep_id==='brandi')).toHaveLength(mine.attention_count);
  });

  it('without scope=all the manager sees her own quotes, with the manager options for the scope switch; rep and team need the scope',async()=>{
    const body=await (await list('?rep=mara')).json();
    expect(body).toMatchObject({scope:'mine',rep_filter:null,counts:{all:SEEDED.brandi}});
    expect(body.rows.every((r:Row)=>r.rep_id==='brandi')).toBe(true);
    expect(body.manager.reps).toHaveLength(4);
  });
});

describe('a rep and the All reps scope',()=>{
  it('refuses scope=all with 403 and keeps the rep’s own list',async()=>{
    const refused=await list('?scope=all','mara');
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({detail:'Manager access required.'});
    const own=await (await list('?rep=brandi','mara')).json();
    expect(own).toMatchObject({scope:'mine',manager:null,counts:{all:SEEDED.mara+2}});
    expect(own.rows.every((r:Row)=>r.rep_id==='mara')).toBe(true);
    expect((await list('?scope=all','eli')).status).toBe(403);
  });
});

describe('GET /api/rep/badges?scope=all',()=>{
  it('counts every rep’s red quotes for the manager; unread stays her own',async()=>{
    const own=await (await badges()).json();
    const all=await (await badges('?scope=all')).json();
    const othersRed=(await (await list('?scope=all&attention=1')).json()).rows.filter((r:Row&{aging:{level:string}})=>r.rep_id!=='brandi'&&r.aging.level==='red').length;
    expect(othersRed).toBeGreaterThan(1);
    expect(all).toEqual({quotes:own.quotes,attention:own.attention+othersRed});
  });
  it('refuses a rep (403)',async()=>{
    expect((await badges('?scope=all','mara')).status).toBe(403);
    // The two made above and her new demo draft are unread; this Overdue one and her demo book's Overdue draft and change request.
    expect(await (await badges('','mara')).json()).toEqual({quotes:3,attention:3});
  });
});
