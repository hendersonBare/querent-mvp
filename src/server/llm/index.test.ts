// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import {getJudge,getParser,judgeAll,JUDGE_ERROR,type JudgeTask} from './index';
import type {Judge,JudgeCandidate} from './types';

const candidates=(...skus:string[]):JudgeCandidate[]=>skus.map(sku=>({sku,description:`item ${sku}`}));
const task=(i:number,skus=['A','B']):JudgeTask=>({line:{description:`line ${i}`,rawText:`line ${i}`},candidates:candidates(...skus)});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

describe('getParser / getJudge',()=>{
  it('pick the scripted implementations when QUERENT_SCRIPTED=1 or no key',()=>{
    expect(getParser({QUERENT_SCRIPTED:'1',ANTHROPIC_API_KEY:'test-key'}).mode).toBe('scripted');
    expect(getJudge({}).mode).toBe('scripted');
  });
  it('pick the live implementations with a key',()=>{
    expect(getParser({ANTHROPIC_API_KEY:'test-key'}).mode).toBe('live');
    expect(getJudge({ANTHROPIC_API_KEY:'test-key'}).mode).toBe('live');
  });
  it('scripted ones work offline',async()=>{
    const parsed=await getParser({}).parse({kind:'text',text:'12x10x8 boxes qty 4'});
    expect(parsed).toMatchObject({ok:true,rows:[{quantity:4}]});
    expect(await getJudge({}).judge({description:'zzz unknown',rawText:'zzz'},candidates('X'))).toMatchObject({sku:'X'});
  });
});

describe('judgeAll',()=>{
  it('returns one verdict per line, in input order',async()=>{
    const judge:Judge={judge:async(line,c)=>{await sleep(line.description==='line 0'?15:1);return {sku:c[0].sku,reason:line.description};}};
    const out=await judgeAll([task(0),task(1),task(2)],judge);
    expect(out.map(v=>v.reason)).toEqual(['line 0','line 1','line 2']);
  });

  it('never has more than `concurrency` calls in flight (default 4)',async()=>{
    for(const [concurrency,expected] of [[undefined,4],[2,2],[1,1]] as const){
      let inFlight=0,max=0;
      const judge:Judge={judge:async(_l,c)=>{inFlight++;max=Math.max(max,inFlight);await sleep(3);inFlight--;return {sku:c[0].sku,reason:'ok'};}};
      const out=await judgeAll(Array.from({length:11},(_,i)=>task(i)),judge,concurrency?{concurrency}:{});
      expect(out).toHaveLength(11);
      expect(max,`concurrency ${concurrency}`).toBe(expected);
    }
  });

  it('degrades a timed-out line to judge_error, aborts it, and keeps the rest',async()=>{
    let aborted=false;
    const judge:Judge={judge:(line,c,options)=>{
      if(line.description!=='line 1')return Promise.resolve({sku:c[0].sku,reason:'ok'});
      options?.signal?.addEventListener('abort',()=>{aborted=true;});
      return new Promise(()=>{});
    }};
    const out=await judgeAll([task(0),task(1),task(2)],judge,{timeoutMs:20});
    expect(out).toEqual([{sku:'A',reason:'ok'},{sku:null,reason:JUDGE_ERROR},{sku:'A',reason:'ok'}]);
    expect(aborted).toBe(true);
  });

  it('degrades a failed line to judge_error without failing the batch',async()=>{
    const judge:Judge={judge:async line=>{if(line.description==='line 0')throw new Error('boom');return {sku:'B',reason:'ok'};}};
    expect(await judgeAll([task(0),task(1)],judge)).toEqual([{sku:null,reason:JUDGE_ERROR},{sku:'B',reason:'ok'}]);
  });

  it('turns a verdict naming a SKU outside that line\'s candidates into null',async()=>{
    const judge:Judge={judge:async()=>({sku:'NOPE',reason:'bad judge'})};
    expect(await judgeAll([task(0)],judge)).toEqual([{sku:null,reason:'not_in_candidates'}]);
  });

  it('reports progress as (done, total) after each line',async()=>{
    const onProgress=vi.fn();
    const judge:Judge={judge:async(_l,c)=>({sku:c[0].sku,reason:'ok'})};
    await judgeAll([task(0),task(1),task(2)],judge,{onProgress});
    expect(onProgress.mock.calls).toEqual([[1,3],[2,3],[3,3]]);
  });

  it('survives a throwing progress callback and an empty batch',async()=>{
    const judge:Judge={judge:async(_l,c)=>({sku:c[0].sku,reason:'ok'})};
    expect(await judgeAll([task(0)],judge,{onProgress:()=>{throw new Error('ui');}})).toEqual([{sku:'A',reason:'ok'}]);
    expect(await judgeAll([],judge)).toEqual([]);
  });
});
