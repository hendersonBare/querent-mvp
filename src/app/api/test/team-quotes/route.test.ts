import {afterEach,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// The test-only Team dashboard fixture for e2e/team-dashboard.spec.ts (task D3).
useSeededDatabase();
afterEach(()=>{delete process.env.QUERENT_E2E_RESET;});

it('does not exist unless QUERENT_E2E_RESET=1',async()=>{
  const {POST}=await import('./route');
  expect((await POST()).status).toBe(404);
});

it('adds quotes for Mara and Nora that the Team dashboard compares, one moved to Eli',async()=>{
  process.env.QUERENT_E2E_RESET='1';
  const {POST}=await import('./route');
  const {quoteByNumber}=await import('@/server/repository');
  const {teamMetrics}=await import('@/server/team/service');
  const made=await (await POST()).json();
  expect(quoteByNumber(made.declined_other)).toMatchObject({rep_id:'mara',status:'declined',decline_reason:'other',decline_note:made.other_note});
  expect(quoteByNumber(made.declined_price)).toMatchObject({rep_id:'nora',status:'declined',decline_reason:'price_too_high'});
  expect(quoteByNumber(made.moved)).toMatchObject({rep_id:'eli',original_rep_id:'mara'});
  const now=new Date(),day=86_400_000;
  const result=await teamMetrics(new URLSearchParams({from:new Date(now.getTime()-7*day).toISOString(),to:new Date(now.getTime()+day).toISOString(),reps:'mara,nora'}));
  expect(result.rows.map(r=>[r.rep_id,r.created,r.statuses.declined,r.open.red,r.open.amber])).toEqual([['mara',2,1,1,0],['nora',2,1,0,1]]);
  expect(result.other_notes.map(n=>n.note)).toEqual([made.other_note]);
});
