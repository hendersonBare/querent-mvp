import {afterEach,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// The test-only Quotes list fixture for e2e/rep-quotes.spec.ts (task 3.2).
useSeededDatabase();
afterEach(()=>{delete process.env.QUERENT_E2E_RESET;});

it('does not exist unless QUERENT_E2E_RESET=1',async()=>{
  const {POST}=await import('./route');
  const {quotes}=await import('@/server/repository');
  const response=await POST();
  expect(response.status).toBe(404);
  expect(quotes()).toHaveLength(28);
});

it("adds a changes_requested, a sent, an overdue sent and another rep's quote",async()=>{
  process.env.QUERENT_E2E_RESET='1';
  const {POST}=await import('./route');
  const {quoteByNumber}=await import('@/server/repository');
  const {repQuoteList}=await import('@/server/rep/quotes');
  const response=await POST();
  expect(response.status).toBe(200);
  const made=await response.json();
  expect(made).toEqual({changes_requested:'Q-24818',sent:'Q-24819',overdue:'Q-24820',other_rep:'Q-24821'});
  expect(quoteByNumber(made.changes_requested)).toMatchObject({status:'changes_requested',revision:1,change_request_note:expect.stringMatching(/^Can you make the gloves 6 cases/),unread_for_rep:true});
  expect(quoteByNumber(made.sent)).toMatchObject({status:'sent',unread_for_rep:false});
  expect(quoteByNumber(made.other_rep)).toMatchObject({rep_id:'mara',status:'ready_for_review'});
  const list=await repQuoteList('brandi');
  expect(list.rows.find(r=>r.quote_number===made.overdue)?.status).toBe('expired');
  // With the seed's three aging quotes (task A2): Q-24789 and Q-24791 sent, Q-24790 changes requested.
  expect(list.counts).toMatchObject({all:31,ready_for_review:1,changes_requested:2,sent:3,accepted:17,expired:8});
  expect(list.unread).toBe(2);
});
