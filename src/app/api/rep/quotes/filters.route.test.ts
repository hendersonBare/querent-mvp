// @vitest-environment node
import {NextRequest} from 'next/server';
import {expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// GET /api/rep/quotes with the Quotes page's filter panel (plan U3; C_QOB2, C_QOT1, C_RQB2):
// ?status=a,b, ?rep= (the manager only), ?customer=, ?requested_from=&requested_to= (YYYY-MM-DD, UTC
// days) and ?only=overdue,aging,below_floor. The page and its poll send the same query.
useSeededDatabase();

type Row={quote_number:string;status:string;rep_id:string;requested_at:string};
const get=async(query='',persona='supplier')=>{
  const {GET}=await import('./route');
  const response=await GET(new NextRequest(`http://127.0.0.1/api/rep/quotes${query}`,{headers:{cookie:`querent-persona=${persona}`}}));
  expect(response.status).toBe(200);
  return response.json();
};
const numbers=(list:{rows:Row[]})=>list.rows.map(r=>r.quote_number);

it('takes a status list and keeps the lane counts of the other filters',async()=>{
  const all=await get('?rep=brandi');
  const list=await get('?rep=brandi&status=sent,changes_requested');
  expect(list.statuses).toEqual(['changes_requested','sent']);
  expect(list.rows.every((r:Row)=>['sent','changes_requested'].includes(r.status))).toBe(true);
  expect(list.counts).toEqual(all.counts);
  // One status still reads as before (the Team dashboard's drill-down links, task D3).
  expect((await get('?rep=brandi&status=accepted')).status).toBe('accepted');
});

it('takes Only show and the requested days',async()=>{
  expect(numbers(await get('?rep=brandi&only=overdue')).sort()).toEqual(['Q-24790','Q-24817']);
  expect(numbers(await get('?rep=brandi&only=aging'))).toEqual(['Q-24789']);
  expect(numbers(await get('?rep=brandi&only=below_floor'))).toEqual(['Q-24817']);
  const all=await get('?rep=brandi');
  const from=all.rows.find((r:Row)=>r.quote_number==='Q-24816').requested_at.slice(0,10);
  const list=await get(`?rep=brandi&requested_from=${from}&requested_to=${from}`);
  expect(list).toMatchObject({requested_from:from,requested_to:from});
  expect(numbers(list)).toContain('Q-24816');
  expect(list.rows.every((r:Row)=>r.requested_at.slice(0,10)===from)).toBe(true);
});

it("ignores Rep for a rep: Mara reads her own quotes whatever she asks",async()=>{
  const list=await get('?rep=brandi&only=overdue,aging','mara');
  expect(list.rows.every((r:Row)=>r.rep_id==='mara')).toBe(true);
  expect(list).toMatchObject({rep_filter:null,manager:null,only:['overdue','aging']});
  expect(list.customers.map((c:{id:string})=>c.id)).toEqual(['canyon-ridge']);
});
