import {expect,it} from 'vitest';
import {useSeededDatabase} from './test-db';

useSeededDatabase();

it('resets the whole demo to the seed, pinned to the given date',async()=>{
  const {resetDemoData}=await import('./demo');
  const {createConversation,conversation,quote}=await import('./index');
  createConversation({id:'conv-dirty',customerId:'wasatch'});
  expect(resetDemoData({seedDate:'2026-09-30'})).toBe('2026-09-30');
  expect(conversation('wasatch','conv-dirty')).toBeUndefined();
  expect(quote('q-24817')).toMatchObject({status:'ready_for_review',requested_at:'2026-09-30T16:14:00.000Z'});
  // Without a date it falls back to QUERENT_SEED_DATE (the test database pins the mockup's day).
  expect(resetDemoData()).toBe('2026-09-23');
  expect(quote('q-24817')).toMatchObject({requested_at:'2026-09-23T16:14:00.000Z'});
});

it('rejects a malformed seed date without touching the data',async()=>{
  const {resetDemoData}=await import('./demo');
  const {createConversation,conversation}=await import('./index');
  createConversation({id:'conv-kept',customerId:'wasatch'});
  expect(()=>resetDemoData({seedDate:'2026-02-30'})).toThrow(/must be a date like 2026-09-23/);
  expect(conversation('wasatch','conv-kept')).toBeDefined();
});
