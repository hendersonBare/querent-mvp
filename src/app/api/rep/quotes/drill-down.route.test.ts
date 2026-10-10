import {NextRequest} from 'next/server';
import {beforeAll,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// The Team dashboard's drill-down into the Quotes list (v3 spec §6 Team; decision 23; task D3): the
// manager's All reps scope also takes the dashboard's window (?from=&to=, the quotes created in
// [from, to)), an aging level for the open quotes (?aging=ok|amber|red), and several reps at once
// (?rep=a,b), so every count on the dashboard opens exactly its quotes.
useSeededDatabase();

const HOUR=3_600_000;
const ago=(hours:number)=>new Date(Date.now()-hours*HOUR).toISOString();
const list=async(query:string,persona='supplier')=>(await import('./route')).GET(new NextRequest(`http://127.0.0.1/api/rep/quotes${query}`,{headers:{cookie:`querent-persona=${persona}`}}));
type Row={quote_number:string;rep_id:string;status:string;aging:{level:string}|null};
const numbers=(rows:Row[])=>rows.map(r=>r.quote_number).sort();

let mara={fresh:'',late:'',old:''},nora='';
let FROM='',TO='';
beforeAll(async()=>{
  const {createQuote}=await import('@/server/repository');
  const lines=[{itemId:'GLV-N8-L-1000',qty:2,unitPrice:82,priceBasis:'custom' as const}];
  const make=(customerId:string,hours:number)=>createQuote({customerId,fulfillment:'will_call',branchId:'slc',lines,at:ago(hours)}).quote_number;
  // Mara: a fresh draft (ok), one 30 h old (red), one 10 days old (outside a 3-day window). Nora: a 5 h old draft (amber).
  mara={fresh:make('canyon-ridge',1),late:make('canyon-ridge',30),old:make('canyon-ridge',240)};
  nora=make('uinta-facility',5);
  FROM=encodeURIComponent(ago(72));TO=encodeURIComponent(new Date(Date.now()+HOUR).toISOString());
});

describe('GET /api/rep/quotes?scope=all with the dashboard filters',()=>{
  it('lists only the quotes created in [from, to), with counts over the window',async()=>{
    const body=await (await list(`?scope=all&rep=mara&from=${FROM}&to=${TO}`)).json();
    expect(numbers(body.rows)).toEqual([mara.fresh,mara.late].sort());
    expect(body.counts.all).toBe(2);
    expect(body.window).toEqual({from:decodeURIComponent(FROM),to:decodeURIComponent(TO)});
    expect(numbers((await (await list('?scope=all&rep=mara')).json()).rows)).toEqual([mara.fresh,mara.late,mara.old].sort());
  });

  it('keeps the status filter inside the window',async()=>{
    const body=await (await list(`?scope=all&rep=mara&from=${FROM}&to=${TO}&status=ready_for_review`)).json();
    expect(numbers(body.rows)).toEqual([mara.fresh,mara.late].sort());
    expect((await (await list(`?scope=all&rep=mara&from=${FROM}&to=${TO}&status=declined`)).json()).rows).toEqual([]);
  });

  it('shows the open quotes at one aging level',async()=>{
    const red=await (await list(`?scope=all&from=${FROM}&to=${TO}&aging=red`)).json();
    expect(red).toMatchObject({aging_filter:'red',status:null});
    expect(numbers(red.rows)).toContain(mara.late);
    expect(red.rows.every((r:Row)=>r.aging?.level==='red')).toBe(true);
    const amber=await (await list(`?scope=all&from=${FROM}&to=${TO}&aging=amber&rep=nora`)).json();
    expect(numbers(amber.rows)).toEqual([nora]);
    const ok=await (await list(`?scope=all&rep=mara&from=${FROM}&to=${TO}&aging=ok`)).json();
    expect(numbers(ok.rows)).toEqual([mara.fresh]);
  });

  it('takes several reps at once, in rep order, dropping unknown ones',async()=>{
    const body=await (await list(`?scope=all&rep=nora,ghost,mara&from=${FROM}&to=${TO}`)).json();
    expect(body.rep_filter).toBe('mara,nora');
    expect(numbers(body.rows)).toEqual([mara.fresh,mara.late,nora].sort());
  });

  it('ignores a malformed window or aging level',async()=>{
    const body=await (await list('?scope=all&rep=mara&from=yesterday&to=now&aging=purple')).json();
    expect(body).toMatchObject({window:null,aging_filter:null});
    expect(body.rows).toHaveLength(3);
  });

  it('still refuses the All reps scope to a rep',async()=>{
    expect((await list(`?scope=all&from=${FROM}&to=${TO}`,'mara')).status).toBe(403);
  });
});
