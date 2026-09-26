import {NextRequest} from 'next/server';
import {afterEach,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();
afterEach(()=>{delete process.env.QUERENT_E2E_RESET;delete process.env.QUERENT_SCRIPTED;});

const post=async(body?:unknown)=>{
  const {POST}=await import('./route');
  return POST(new NextRequest('http://127.0.0.1/api/test/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}));
};

it('does not exist unless QUERENT_E2E_RESET=1',async()=>{
  const {createConversation,conversation}=await import('@/server/repository');
  createConversation({id:'conv-live',customerId:'wasatch'});
  const response=await post({seed_date:'2026-09-23'});
  expect(response.status).toBe(404);
  expect(conversation('wasatch','conv-live')).toBeDefined();
});

it('reseeds the demo on the pinned date and reports the chat mode',async()=>{
  process.env.QUERENT_E2E_RESET='1';process.env.QUERENT_SCRIPTED='1';
  const {conversation}=await import('@/server/repository');
  const response=await post({seed_date:'2026-09-23'});
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ok:true,seed_date:'2026-09-23',chat_mode:'scripted'});
  expect(conversation('wasatch','conv-live')).toBeUndefined();
});

it('falls back to the server seed date without a body, and rejects a bad date',async()=>{
  process.env.QUERENT_E2E_RESET='1';
  expect(await (await post()).json()).toMatchObject({ok:true,seed_date:'2026-09-23'});
  const bad=await post({seed_date:'Sept 23'});
  expect(bad.status).toBe(400);
  expect((await bad.json()).detail).toMatch(/must be a date like 2026-09-23/);
  expect((await post({seed_date:20260923})).status).toBe(400);
});
