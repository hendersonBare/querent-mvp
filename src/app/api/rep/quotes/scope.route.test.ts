import {NextRequest} from 'next/server';
import {beforeAll,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// The manager's list (v3 spec §3, §5, §6 Quotes list; decision 22; OA-52; tasks D2, U1):
// GET /api/rep/quotes lists every rep's quotes for the manager by default, with the rep on each row,
// filtered by ?rep=<id>&team=<label>; the Needs attention view and the header's red badge
// (GET /api/rep/badges) cover the same quotes. There is no All reps switch: ?scope=all is ignored.
// A rep's list is still their own quotes only, and the rep and team filters do nothing for them.
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

describe('GET /api/rep/quotes (manager): every rep by default',()=>{
  it('lists every rep’s quotes with the rep on each row, and the reps and teams to filter by',async()=>{
    const response=await list('');
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
    const byRep=await (await list('?rep=mara')).json();
    expect(byRep).toMatchObject({rep_filter:'mara',counts:{all:SEEDED.mara+2}});
    expect(byRep.rows.map((r:Row)=>r.quote_number)).toEqual(expect.arrayContaining([mara.fresh,mara.overdue]));
    expect(byRep.rows.every((r:Row)=>r.rep_id==='mara')).toBe(true);
    const byTeam=await (await list(`?team=${encodeURIComponent('Outside Sales')}`)).json();
    expect(byTeam).toMatchObject({team_filter:'Outside Sales',counts:{all:SEEDED.eli+1}});
    expect(byTeam.rows.map((r:Row)=>r.quote_number)).toContain(nora);
    expect(new Set(byTeam.rows.map((r:Row)=>r.rep_id))).toEqual(new Set(['eli','nora']));
    const inside=await (await list(`?team=${encodeURIComponent('Inside Sales')}`)).json();
    expect(new Set(inside.rows.map((r:Row)=>r.rep_id))).toEqual(new Set(['brandi','mara']));
    const unknown=await (await list('?rep=nobody&team=Nowhere')).json();
    expect(unknown).toMatchObject({rep_filter:null,team_filter:null,counts:{all:ALL}});
  });

  it('a parent team takes in the reps of the teams inside it (decision 47); a team with no own members still filters',async()=>{
    const {createTeam,deleteTeam,setTeamParent,teamList}=await import('@/server/repository');
    const field=createTeam({name:'Field',parentId:null,repIds:[]});
    if(!field.ok)throw new Error('createTeam refused');
    const outside=teamList().find(t=>t.name==='Outside Sales')!;
    expect(setTeamParent(outside.id,field.id)).toBe('ok');
    try{
      const body=await (await list(`?team=Field`)).json();
      expect(body.manager.teams).toEqual(['Field','Inside Sales','Outside Sales']);
      expect(body).toMatchObject({team_filter:'Field',counts:{all:SEEDED.eli+1}});
      expect(new Set(body.rows.map((r:Row)=>r.rep_id))).toEqual(new Set(['eli','nora']));
      // The child alone is unchanged, and a rep picked with the parent must be in it.
      expect(new Set((await (await list(`?team=${encodeURIComponent('Outside Sales')}`)).json()).rows.map((r:Row)=>r.rep_id))).toEqual(new Set(['eli','nora']));
      const both=await (await list('?team=Field&rep=eli,mara')).json();
      expect(new Set(both.rows.map((r:Row)=>r.rep_id))).toEqual(new Set(['eli']));
    }finally{
      setTeamParent(outside.id,null);
      deleteTeam(field.id);
    }
  });

  it('runs the Needs attention view over every rep, red first',async()=>{
    const body=await (await list('?attention=1')).json();
    const numbers=body.rows.map((r:Row)=>r.quote_number);
    expect(numbers).toContain(mara.overdue);
    expect(numbers).toContain(nora);
    expect(numbers).not.toContain(mara.fresh);
    expect(body.attention_count).toBe(body.rows.length);
    const levels=body.rows.map((r:{aging:{level:string}})=>r.aging.level);
    expect(levels).toEqual([...levels].sort((a:string,b:string)=>(a==='red'?0:1)-(b==='red'?0:1)));
    const mine=await (await list('?attention=1&rep=brandi')).json();
    expect(mine.rows.every((r:Row)=>r.rep_id==='brandi')).toBe(true);
    expect(body.rows.filter((r:Row)=>r.rep_id==='brandi')).toHaveLength(mine.attention_count);
  });

  it('ignores ?scope=all: the same list with or without it',async()=>{
    const plain=await (await list('?rep=mara')).json();
    const scoped=await (await list('?scope=all&rep=mara')).json();
    expect(scoped).toEqual({...plain,as_of:scoped.as_of,rows:scoped.rows});
    expect(scoped.rows.map((r:Row)=>r.quote_number)).toEqual(plain.rows.map((r:Row)=>r.quote_number));
    expect(plain.manager.reps).toHaveLength(4);
  });
});

describe('a rep',()=>{
  it('ignores ?scope=all and the rep and team filters: their own list, never a 403',async()=>{
    for(const query of ['?scope=all','?rep=brandi','?scope=all&team=Inside%20Sales']){
      const response=await list(query,'mara');
      expect(response.status).toBe(200);
      const own=await response.json();
      expect(own).toMatchObject({scope:'mine',manager:null,rep_filter:null,team_filter:null,counts:{all:SEEDED.mara+2}});
      expect(own.rows.every((r:Row)=>r.rep_id==='mara')).toBe(true);
    }
    expect((await list('?scope=all','eli')).status).toBe(200);
  });
});

describe('GET /api/rep/badges',()=>{
  it('counts every rep’s red quotes for the manager by default; unread stays her own; ?scope=all changes nothing',async()=>{
    const all=await (await badges()).json();
    const red=(await (await list('?attention=1')).json()).rows.filter((r:Row&{aging:{level:string}})=>r.aging.level==='red');
    const ownRed=red.filter((r:Row)=>r.rep_id==='brandi').length;
    expect(red.length-ownRed).toBeGreaterThan(1);
    expect(all).toMatchObject({quotes:1,attention:red.length});
    expect(await (await badges('?scope=all')).json()).toEqual(all);
  });
  it('counts a rep’s own; ?scope=all is ignored for them, not refused',async()=>{
    expect((await badges('?scope=all','mara')).status).toBe(200);
    // The two made above and her new demo draft are unread; this Overdue one and her demo book's Overdue draft and change request.
    expect(await (await badges('','mara')).json()).toMatchObject({quotes:3,attention:3});
  });
});
