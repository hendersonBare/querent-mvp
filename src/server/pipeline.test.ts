import {expect,it} from 'vitest';
import {useSeededDatabase} from './repository/test-db';

useSeededDatabase();

// Until scripted chat (task 0.4) and tool-calling chat (task 2.1) land, every question gets a
// holding answer that points to the customer's rep, and nothing is looked up.
it('answers with a holding message that points to the assigned rep, and logs it',async()=>{
  const {ask}=await import('./pipeline');
  const {history}=await import('./repository/customer');
  const result=await ask('wasatch','conv-1','Do you have 1/2 in grade 8 hex bolts in stock?');
  expect(result).toMatchObject({sql:null,categories:[],outcome:'no_rows',row_count:0});
  expect(result.answer).toContain('Brandi Gallegos');
  expect(result.answer).toContain('(801) 111-2222');
  expect(history('wasatch','conv-1')).toEqual([expect.objectContaining({question:'Do you have 1/2 in grade 8 hex bolts in stock?',answer:result.answer,outcome:'no_rows'})]);
});

it('gives the same holding answer when an API key is configured',async()=>{
  process.env.ANTHROPIC_API_KEY='sk-test-not-used';
  try{
    const {ask}=await import('./pipeline');
    const result=await ask('wasatch','conv-2','What is our open balance?');
    expect(result.answer).toContain('Brandi Gallegos');
  }finally{delete process.env.ANTHROPIC_API_KEY;}
});
