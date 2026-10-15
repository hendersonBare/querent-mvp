// @vitest-environment node
import Anthropic from '@anthropic-ai/sdk';
import {describe,expect,it} from 'vitest';
import {createLiveJudge,JUDGE_ERROR,JUDGE_SYSTEM_PROMPT} from './judge';
import {fakeClient,textReply,toolReply} from './testing';
import type {JudgeCandidate} from './types';

const LINE={description:'12 x 10 x 8" corrugated boxes, 32 ECT',rawText:'S-4128 12 x 10 x 8" corrugated boxes, 32 ECT 10 bundles'};
const CANDIDATES:JudgeCandidate[]=[
  {sku:'12108-BDL',description:'Corrugated Boxes 12x10x8", 32 ECT single wall, bundle pricing',pack:'Each',category:'boxes'},
  {sku:'12108-PLT',description:'Corrugated Boxes 12x10x8", 32 ECT single wall, pallet pricing',pack:'Each',category:'boxes'},
  {sku:'12810',description:'Corrugated Boxes 12x8x10"',pack:null},
];
const judgeWith=(...answers:Parameters<typeof fakeClient>)=>{
  const client=fakeClient(...answers);
  return {client,judge:createLiveJudge({client,model:'test-model'})};
};

describe('live judge: request shape',()=>{
  it('restricts sku to an enum of the candidate SKUs plus null',async()=>{
    const {client,judge}=judgeWith(toolReply('choose_candidate',{sku:'12108-BDL',reason:'Same box.'}));
    await judge.judge(LINE,CANDIDATES);
    const {body}=client.requests[0];
    expect(body.model).toBe('test-model');
    expect(body.system).toBe(JUDGE_SYSTEM_PROMPT);
    expect(body.tool_choice).toEqual({type:'auto',disable_parallel_tool_use:true});
    expect(body.tools).toHaveLength(1);
    const tool=body.tools![0] as Anthropic.Tool;
    expect(tool.name).toBe('choose_candidate');
    const props=tool.input_schema.properties as Record<string,{type:unknown;enum?:unknown[]}>;
    expect(props.sku.enum).toEqual(['12108-BDL','12108-PLT','12810',null]);
    expect(props.sku.type).toEqual(['string','null']);
    expect(props.reason.type).toBe('string');
    expect(tool.input_schema.required).toEqual(['sku','reason']);
  });

  it('sends the line and only the numbered candidates (sku, description, pack, category), never prices',async()=>{
    const {client,judge}=judgeWith(toolReply('choose_candidate',{sku:null,reason:'none'}));
    const priced=CANDIDATES.map(c=>({...c,listPrice:0.84,list:1.23,unitPrice:9.99,keywords:'secret keywords'}));
    await judge.judge(LINE,priced);
    const sent=JSON.stringify(client.requests[0].body);
    expect(sent).toContain('1. ');
    expect(sent).toContain('3. ');
    expect(sent).toContain('12108-PLT');
    expect(sent).toContain('pallet pricing');
    expect(sent).toContain('boxes');
    expect(sent).toContain('S-4128 12 x 10 x 8');
    for(const leak of ['0.84','1.23','9.99','listPrice','unitPrice','secret keywords'])expect(sent).not.toContain(leak);
  });

  it('states the matching rules in the prompt',()=>{
    for(const phrase of [/same product/i,/dimensions/i,/order/i,/material/i,/colou?r/i,/thickness|strength/i,/pack/i,/null/i,/pricing tier|bundle/i,/first/i,/never guess/i])expect(JUDGE_SYSTEM_PROMPT).toMatch(phrase);
  });

  it('does not call the API when there are no candidates',async()=>{
    const {client,judge}=judgeWith(toolReply('choose_candidate',{sku:null,reason:'x'}));
    expect(await judge.judge(LINE,[])).toEqual({sku:null,reason:'no_candidates'});
    expect(client.requests).toHaveLength(0);
  });

  it('passes an abort signal and a timeout through to the request',async()=>{
    const {client,judge}=judgeWith(toolReply('choose_candidate',{sku:null,reason:'x'}));
    const controller=new AbortController();
    await judge.judge(LINE,CANDIDATES,{signal:controller.signal});
    expect(client.requests[0].options?.signal).toBe(controller.signal);
    expect(client.requests[0].options?.timeout).toBeGreaterThan(0);
  });
});

describe('live judge: validation (fail closed)',()=>{
  it('returns a SKU from the list',async()=>{
    expect(await judgeWith(toolReply('choose_candidate',{sku:'12108-BDL',reason:'Same box, bundle tier.'})).judge.judge(LINE,CANDIDATES))
      .toEqual({sku:'12108-BDL',reason:'Same box, bundle tier.'});
  });

  it('returns null when the judge says none',async()=>{
    expect(await judgeWith(toolReply('choose_candidate',{sku:null,reason:'Different dimension order.'})).judge.judge(LINE,CANDIDATES))
      .toEqual({sku:null,reason:'Different dimension order.'});
  });

  it('turns a SKU outside the candidate list into null',async()=>{
    const verdict=await judgeWith(toolReply('choose_candidate',{sku:'S-4128',reason:'Their SKU.'})).judge.judge(LINE,CANDIDATES);
    expect(verdict.sku).toBeNull();
    expect(verdict.reason).toBe('not_in_candidates');
  });

  it.each([
    ['sku is a number',toolReply('choose_candidate',{sku:12108,reason:'x'})],
    ['sku is missing',toolReply('choose_candidate',{reason:'x'})],
    ['the input is not an object',toolReply('choose_candidate','12108-BDL')],
    ['the model answers in text',textReply('12108-BDL')],
    ['the model refuses',toolReply('choose_candidate',{sku:'12108-BDL',reason:'x'},{stopReason:'refusal'})],
    ['the answer is cut off',toolReply('choose_candidate',{sku:'12108-BDL',reason:'x'},{stopReason:'max_tokens'})],
    ['the API fails',new Anthropic.APIConnectionTimeoutError()],
    ['the request throws',new Error('boom')],
  ])('answers judge_error when %s',async(_,answer)=>{
    expect(await judgeWith(answer).judge.judge(LINE,CANDIDATES)).toEqual({sku:null,reason:JUDGE_ERROR});
  });

  it('keeps reasons short',async()=>{
    const verdict=await judgeWith(toolReply('choose_candidate',{sku:null,reason:'x'.repeat(5000)})).judge.judge(LINE,CANDIDATES);
    expect(verdict.reason.length).toBeLessThanOrEqual(500);
  });
});
