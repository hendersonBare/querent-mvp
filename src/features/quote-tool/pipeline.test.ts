// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import {JUDGE_ERROR} from '@/server/llm/verdicts';
import type {ParseOptions} from '@/server/llm/types';
import {PARSE_TIMEOUT_ERROR,NO_ROWS_ERROR,runPipeline,type PipelineOptions} from './pipeline';
import type {ProgressEvent} from './types';
import {CATALOG,CLEAR_BAGS,CLEAR_BOX,CLEAR_WRAP,NOTHING,STRICT,TIE,WRONG_BOX,fakeJudge,fakeParser,row} from './test-fixtures';

// The quote tool's pipeline (docs/boxt/plan.md product rule 3): parse → retrieve → judge (only lines the
// scorer clears) → decide, with a fake parser and judge and a small catalog through the real scorer.

const TEXT={kind:'text' as const,text:'(the fake parser ignores this)'};
const SKUS=new Set(CATALOG.map(i=>i.sku));

function options(overrides:Partial<PipelineOptions>&Pick<PipelineOptions,'parser'>):PipelineOptions{
  return {judge:fakeJudge(),catalog:CATALOG,config:STRICT,...overrides};
}

describe('runPipeline',()=>{
  it('matches a clearing line the judge agrees with, with the item from the catalog',async()=>{
    const result=await runPipeline(TEXT,options({parser:fakeParser([row(CLEAR_BOX,{rawText:'S-4128 12x10x8 boxes 32 ECT 10 bdl'})])}));
    expect(result.ok).toBe(true);
    if(!result.ok)return;
    const [line]=result.lines;
    expect(line).toMatchObject({
      index:0,rawText:'S-4128 12x10x8 boxes 32 ECT 10 bdl',description:CLEAR_BOX,quantity:10,unit:'case',quantityUnclear:false,
      outcome:'matched',reason:'matched',score:1,
      item:{sku:'12108-BDL',description:'12x10x8" Corrugated Boxes, 32 ECT, bundle pricing',pack:'Bundle of 25',category:'Boxes',listPrice:0.84},
    });
    expect(line.candidates.map(c=>c.sku)).toEqual(['12108-BDL','12108-PLT','161212-BDL']);
    expect(line.candidates[2]).toEqual({sku:'161212-BDL',description:'16x12x12" Corrugated Boxes, 32 ECT, bundle pricing',pack:'Bundle of 25',category:'Boxes',listPrice:1.52,score:expect.any(Number)});
    expect(result.counts).toEqual({rows:1,matched:1,unmatched:0,judged:1});
  });

  it('asks the judge only about lines the scorer clears, with SKU, description, pack label and category',async()=>{
    const judge=fakeJudge();
    const result=await runPipeline(TEXT,options({judge,parser:fakeParser([row(CLEAR_BOX),row(NOTHING),row(TIE),row(CLEAR_WRAP),row(WRONG_BOX)])}));
    expect(judge.calls.map(c=>c.description)).toEqual([CLEAR_BOX,CLEAR_WRAP]);
    expect(judge.calls[0].candidates).toEqual([
      {sku:'12108-BDL',description:'12x10x8" Corrugated Boxes, 32 ECT, bundle pricing',pack:'Bundle of 25',category:'Boxes'},
      {sku:'12108-PLT',description:'12x10x8" Corrugated Boxes, 32 ECT, pallet pricing',pack:'Bundle of 25',category:'Boxes'},
      {sku:'161212-BDL',description:'16x12x12" Corrugated Boxes, 32 ECT, bundle pricing',pack:'Bundle of 25',category:'Boxes'},
    ]);
    expect(JSON.stringify(judge.calls)).not.toMatch(/listPrice|0\.84/);
    if(!result.ok)throw new Error(result.error);
    expect(result.lines.map(l=>[l.outcome,l.reason])).toEqual([
      ['matched','matched'],['no_match','no_candidates'],['no_match','low_lead'],['matched','matched'],['no_match','below_threshold'],
    ]);
    expect(result.counts).toEqual({rows:5,matched:2,unmatched:3,judged:2});
  });

  it('a line that does not clear is No match even when the judge would agree',async()=>{
    const judge=fakeJudge((_,c)=>({sku:c[0].sku,reason:'agree'}));
    const result=await runPipeline(TEXT,options({judge,parser:fakeParser([row(TIE)])}));
    expect(result.ok&&result.lines[0]).toMatchObject({outcome:'no_match',reason:'low_lead'});
    expect(judge.calls).toEqual([]);
  });

  it('judge "none" makes a clearing line No match',async()=>{
    const result=await runPipeline(TEXT,options({judge:fakeJudge(()=>({sku:null,reason:'different item'})),parser:fakeParser([row(CLEAR_BAGS)])}));
    expect(result.ok&&result.lines[0]).toMatchObject({outcome:'no_match',reason:'judge_none'});
    expect(result.ok&&result.lines[0].item).toBeUndefined();
  });

  it('a judge pick from another product group is No match',async()=>{
    const result=await runPipeline(TEXT,options({judge:fakeJudge(()=>({sku:'161212-BDL',reason:'other box'})),parser:fakeParser([row(CLEAR_BOX)])}));
    expect(result.ok&&result.lines[0]).toMatchObject({outcome:'no_match',reason:'judge_disagrees'});
  });

  it('a judge pick of the other pricing tier matches that tier',async()=>{
    const result=await runPipeline(TEXT,options({judge:fakeJudge(()=>({sku:'12108-PLT',reason:'pallet'})),parser:fakeParser([row(CLEAR_BOX)])}));
    expect(result.ok&&result.lines[0]).toMatchObject({outcome:'matched',item:{sku:'12108-PLT',listPrice:0.71}});
  });

  it('a failing, throwing or timed-out judge makes the line No match (judge_error) and the run still finishes',async()=>{
    const result=await runPipeline(TEXT,options({
      judgeTimeoutMs:30,
      judge:fakeJudge(description=>{
        if(description===CLEAR_BOX)throw new Error('boom');
        if(description===CLEAR_WRAP)return new Promise(()=>{});
        return {sku:null,reason:JUDGE_ERROR};
      }),
      parser:fakeParser([row(CLEAR_BOX),row(CLEAR_WRAP),row(CLEAR_BAGS)]),
    }));
    if(!result.ok)throw new Error(result.error);
    expect(result.lines.map(l=>[l.outcome,l.reason])).toEqual([['no_match','judge_error'],['no_match','judge_error'],['no_match','judge_error']]);
    expect(result.counts).toEqual({rows:3,matched:0,unmatched:3,judged:3});
  });

  it('never answers a SKU outside the catalog, whatever the judge names',async()=>{
    const result=await runPipeline(TEXT,options({judge:fakeJudge(()=>({sku:'S-4128',reason:'the customer typed it'})),parser:fakeParser([row(CLEAR_BOX,{suppliersSku:'S-4128'}),row(CLEAR_WRAP)])}));
    if(!result.ok)throw new Error(result.error);
    expect(result.lines.every(l=>l.outcome==='no_match')).toBe(true);
    for(const line of result.lines)for(const sku of [line.item?.sku,...line.candidates.map(c=>c.sku),...line.nearMisses.map(c=>c.sku)].filter(Boolean))expect(SKUS.has(sku!)).toBe(true);
  });

  it('gives every parsed row exactly one outcome, in list order (200 rows)',async()=>{
    const descriptions=[CLEAR_BOX,NOTHING,TIE,CLEAR_WRAP,WRONG_BOX,CLEAR_BAGS];
    const rows=Array.from({length:200},(_,i)=>row(descriptions[i%descriptions.length],{rawText:`line ${i}`}));
    const result=await runPipeline(TEXT,options({parser:fakeParser(rows)}));
    if(!result.ok)throw new Error(result.error);
    expect(result.lines.map(l=>l.index)).toEqual(rows.map((_,i)=>i));
    expect(result.lines.map(l=>l.rawText)).toEqual(rows.map(r=>r.rawText));
    expect(result.lines.every(l=>l.outcome==='matched'?l.item!==undefined:l.item===undefined)).toBe(true);
    expect(result.counts.matched+result.counts.unmatched).toBe(200);
  });

  it('keeps an unclear quantity unclear',async()=>{
    const result=await runPipeline(TEXT,options({parser:fakeParser([row(CLEAR_WRAP,{quantity:null,unit:null,quantityUnclear:true})])}));
    expect(result.ok&&result.lines[0]).toMatchObject({quantity:null,quantityUnclear:true,outcome:'matched'});
  });

  it('offers at most 5 near-misses, one per product group, best first, with scores',async()=>{
    const many=Array.from({length:9},(_,i)=>({sku:`BOX-${i}`,description:`${10+i}x10x8" Corrugated Boxes, 32 ECT`,pack:'Each',caseQty:25,listPrice:1,category:'Boxes',keywords:''}));
    const result=await runPipeline(TEXT,options({catalog:[...CATALOG,...many],parser:fakeParser([row('12x10x8" Corrugated Boxes, 44 ECT')])}));
    if(!result.ok)throw new Error(result.error);
    const {nearMisses,candidates}=result.lines[0];
    expect(nearMisses.length).toBe(5);
    expect(new Set(nearMisses.map(n=>n.description.replace(/, (bundle|pallet) pricing/,''))).size).toBe(5);
    expect(nearMisses.map(n=>n.score)).toEqual([...nearMisses.map(n=>n.score)].sort((a,b)=>b-a));
    expect(candidates.length).toBeLessThanOrEqual(8);
  });

  it('reports progress per stage with done and total',async()=>{
    const events:ProgressEvent[]=[];
    await runPipeline(TEXT,options({onProgress:e=>events.push(e),parser:fakeParser([row(CLEAR_BOX),row(NOTHING),row(CLEAR_WRAP)])}));
    expect(events).toEqual([
      {stage:'parse',done:0,total:1},{stage:'parse',done:1,total:1},
      {stage:'match',done:0,total:3},{stage:'match',done:1,total:3},{stage:'match',done:2,total:3},{stage:'match',done:3,total:3},
      {stage:'judge',done:0,total:2},{stage:'judge',done:1,total:2},{stage:'judge',done:2,total:2},
    ]);
  });

  it('skips the judge stage when no line clears',async()=>{
    const events:ProgressEvent[]=[];
    const judge=fakeJudge();
    const result=await runPipeline(TEXT,options({judge,onProgress:e=>events.push(e),parser:fakeParser([row(NOTHING)])}));
    expect(result.ok&&result.counts).toEqual({rows:1,matched:0,unmatched:1,judged:0});
    expect(events.some(e=>e.stage==='judge')).toBe(false);
    expect(judge.calls).toEqual([]);
  });

  it('passes a parse error through and does no matching',async()=>{
    const judge=fakeJudge();
    const result=await runPipeline(TEXT,options({judge,parser:fakeParser({error:'Could not read that list.'})}));
    expect(result).toEqual({ok:false,error:'Could not read that list.',timedOut:false});
    expect(judge.calls).toEqual([]);
  });

  it('refuses a list with no product lines',async()=>{
    expect(await runPipeline(TEXT,options({parser:fakeParser([])}))).toEqual({ok:false,error:NO_ROWS_ERROR,timedOut:false});
  });

  it('gives up on a parse that runs past its time limit, and aborts it',async()=>{
    let signal:AbortSignal|undefined;
    const parser={parse:(_:unknown,opts?:ParseOptions)=>{signal=opts?.signal;return new Promise<never>(()=>{});}};
    const started=Date.now();
    const result=await runPipeline(TEXT,options({parser,parseTimeoutMs:40}));
    expect(result).toEqual({ok:false,error:PARSE_TIMEOUT_ERROR,timedOut:true});
    expect(Date.now()-started).toBeLessThan(1000);
    expect(signal?.aborted).toBe(true);
  });

  it('stops judging at the overall deadline: lines not judged by then are No match',async()=>{
    vi.useRealTimers();
    const judge=fakeJudge(async(_,c)=>{await new Promise(r=>setTimeout(r,25));return {sku:c[0].sku,reason:'ok'};});
    const rows=Array.from({length:12},()=>row(CLEAR_BOX));
    const result=await runPipeline(TEXT,options({judge,parser:fakeParser(rows),judgeConcurrency:1,deadlineMs:110}));
    if(!result.ok)throw new Error(result.error);
    const matched=result.lines.filter(l=>l.outcome==='matched').length;
    expect(matched).toBeGreaterThan(0);
    expect(matched).toBeLessThan(12);
    expect(result.lines.filter(l=>l.outcome==='no_match').every(l=>l.reason==='judge_error')).toBe(true);
  });

  it('asks the supplier-SKU map about a line with a supplier SKU, and still matches by description only',async()=>{
    const lookup=vi.fn(async()=>'SF188CAST');
    const result=await runPipeline(TEXT,options({skuMap:{lookup},parser:fakeParser([row(CLEAR_BOX,{suppliersSku:'S-4128'}),row(NOTHING)])}));
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith('S-4128');
    expect(result.ok&&result.lines.map(l=>l.item?.sku??null)).toEqual(['12108-BDL',null]);
  });
});
