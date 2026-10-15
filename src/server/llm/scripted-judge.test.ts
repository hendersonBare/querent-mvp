// @vitest-environment node
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import judgeFixture from './fixtures/judge.json';
import {createScriptedJudge,judgeKey} from './scripted-judge';
import type {JudgeCandidate,JudgeVerdict} from './types';

const CANDIDATES:JudgeCandidate[]=[
  {sku:'12108-BDL',description:'Corrugated Boxes 12x10x8", 32 ECT single wall, bundle pricing'},
  {sku:'12108-PLT',description:'Corrugated Boxes 12x10x8", 32 ECT single wall, pallet pricing'},
];
const line=(description:string)=>({description,rawText:`S-1 ${description} qty 1`});

describe('judgeKey',()=>{
  it('normalizes case, spacing, quote marks and spaced dimensions',()=>{
    expect(judgeKey('  12 X 10 x 8”  Corrugated   Boxes. ')).toBe(judgeKey('12x10x8" corrugated boxes'));
    expect(judgeKey('12x10x8" corrugated boxes')).toBe('12x10x8" corrugated boxes');
  });
});

describe('scripted judge',()=>{
  const verdicts:Record<string,JudgeVerdict>={
    [judgeKey('12x10x8 boxes, pallet')]:{sku:'12108-PLT',reason:'recorded: pallet tier'},
    [judgeKey('12x8x10 boxes')]:{sku:null,reason:'recorded: different order'},
    [judgeKey('12x10x8 boxes, gone')]:{sku:'GONE-1',reason:'recorded: an item no longer offered'},
  };
  const judge=createScriptedJudge({verdicts});

  it('answers a recorded verdict when its SKU is a candidate',async()=>{
    expect(await judge.judge(line('12 x 10 x 8 boxes, Pallet'),CANDIDATES)).toEqual({sku:'12108-PLT',reason:'recorded: pallet tier'});
  });

  it('answers a recorded none',async()=>{
    expect(await judge.judge(line('12x8x10 boxes'),CANDIDATES)).toEqual({sku:null,reason:'recorded: different order'});
  });

  it('never answers a SKU outside the list',async()=>{
    expect(await judge.judge(line('12x10x8 boxes, gone'),CANDIDATES)).toEqual({sku:null,reason:'not_in_candidates'});
  });

  it('picks the first candidate when nothing is recorded',async()=>{
    expect(await judge.judge(line('something new'),CANDIDATES)).toEqual({sku:'12108-BDL',reason:'scripted_first_candidate'});
  });

  it('answers none without candidates',async()=>{
    expect(await judge.judge(line('12x10x8 boxes, pallet'),[])).toEqual({sku:null,reason:'no_candidates'});
  });
});

describe('fixtures/judge.json',()=>{
  const catalog=JSON.parse(readFileSync(join(process.cwd(),'data/boxt-catalog.json'),'utf8')) as {sku:string}[];
  const skus=new Set(catalog.map(i=>i.sku));
  const entries=Object.entries(judgeFixture as Record<string,JudgeVerdict>);

  it('holds normalized keys and well-formed verdicts naming real catalog SKUs (or null)',()=>{
    expect(entries.length).toBeGreaterThan(0);
    for(const [key,verdict] of entries){
      expect(judgeKey(key),key).toBe(key);
      expect(Object.keys(verdict).sort(),key).toEqual(['reason','sku']);
      expect(typeof verdict.reason,key).toBe('string');
      if(verdict.sku!==null)expect(skus.has(verdict.sku),`${key} → ${verdict.sku}`).toBe(true);
    }
    expect(entries.some(([,v])=>v.sku===null)).toBe(true);
  });

  it('is what the default scripted judge answers from',async()=>{
    const [key,verdict]=entries.find(([,v])=>v.sku!==null)!;
    const judge=createScriptedJudge();
    expect(await judge.judge({description:key,rawText:key},[{sku:'OTHER',description:'x'},{sku:verdict.sku!,description:'y'}])).toEqual(verdict);
  });
});
