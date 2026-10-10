import type Anthropic from '@anthropic-ai/sdk';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {PickerInput} from './suggestions';

// Claude picks the pop-up's "Frequently bought together" from the server's pool (task E1), against a
// mocked Anthropic SDK: never the real API. The server still validates every pick (suggestions.ts);
// this checks the request carries only cost-free facts, the answer is read from the tool call, and
// failures throw (so the caller falls back to the scripted picks) and pause further requests.

const sdk=vi.hoisted(()=>({constructed:[] as unknown[],create:vi.fn()}));
vi.mock('@anthropic-ai/sdk',()=>({default:class{
  messages={create:sdk.create};
  constructor(options:unknown){sdk.constructed.push(options);}
}}));

const {PICK_TOOL,PICKER_BACKOFF_MS,claudeSuggestionPicker,picksFrom,suggestionPicker}=await import('./suggestion-picker');

afterEach(()=>{vi.unstubAllEnvs();sdk.create.mockReset();});

const INPUT:PickerInput={
  cart:[{sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',pack:'Box of 50',qty:10}],
  candidates:[
    {sku:'HN-12-13-G8',description:'Hex nut 1/2-13, Grade 8, yellow zinc',pack:'Box of 100',rule:'matching_fastener',anchor:{sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc'},
      part:'nut',bolt:{diameter:'1/2',thread:'13',grade:'8'},history:null,history_months:12,template_reason:'Matches the 1/2-13 Grade 8 bolts on your list.'},
    {sku:'FW-12-G8',description:'Flat washer 1/2 in, Grade 8, yellow zinc',pack:'Box of 100',rule:'matching_fastener',anchor:{sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc'},
      part:'washer',bolt:{diameter:'1/2',thread:'13',grade:'8'},history:null,history_months:12,template_reason:'Matches the 1/2-13 Grade 8 bolts on your list.'},
  ],
};

let ids=0;
const answer=(content:Anthropic.ContentBlock[]):Anthropic.Message=>({
  id:`msg_${++ids}`,type:'message',role:'assistant',model:'claude-sonnet-5',content,stop_reason:'tool_use',stop_sequence:null,
  usage:{input_tokens:10,output_tokens:10,cache_creation_input_tokens:null,cache_read_input_tokens:null,server_tool_use:null,service_tier:null},
} as Anthropic.Message);
const picks=(list:unknown):Anthropic.ContentBlock=>({type:'tool_use',id:`toolu_${++ids}`,name:PICK_TOOL.name,input:{picks:list}} as Anthropic.ContentBlock);
const fake=(...turns:(Anthropic.Message|Error)[])=>{
  const requests:{body:Anthropic.MessageCreateParamsNonStreaming;options?:Anthropic.RequestOptions}[]=[];
  return {requests,client:{messages:{create:async(body:Anthropic.MessageCreateParamsNonStreaming,options?:Anthropic.RequestOptions)=>{
    requests.push({body,options});
    const turn=turns.shift();
    if(!turn||turn instanceof Error)throw turn??new Error('no answer');
    return turn;
  }}}};
};

describe('claudeSuggestionPicker',()=>{
  it('asks once, through the pick tool, with the cart and the pool as cost-free JSON, quick or not at all',async()=>{
    const {client,requests}=fake(answer([picks([{sku:'FW-12-G8',reason:'Washers for the bolts.'}])]));
    const picker=claudeSuggestionPicker({client,model:'claude-test'});
    expect(await picker(INPUT)).toEqual([{sku:'FW-12-G8',reason:'Washers for the bolts.'}]);
    expect(requests).toHaveLength(1);
    const {body,options}=requests[0];
    expect(body).toMatchObject({model:'claude-test',tools:[PICK_TOOL],tool_choice:{type:'auto',disable_parallel_tool_use:true}});
    expect(options).toMatchObject({maxRetries:0});
    const prompt=JSON.stringify(body.messages);
    expect(prompt).toContain('HN-12-13-G8');
    expect(prompt).not.toMatch(/cost|price|margin|\$/i);
    expect(body.system).toMatch(/at most 3/);
  });

  it('refuses facts that carry cost or price, without asking',async()=>{
    const {client,requests}=fake();
    const leaky={...INPUT,candidates:[{...INPUT.candidates[0],unit_cost:1.2}]} as unknown as PickerInput;
    await expect(claudeSuggestionPicker({client})(leaky)).rejects.toThrow(/cost/);
    expect(requests).toHaveLength(0);
  });

  it('throws when Claude fails, then pauses before asking again',async()=>{
    let now=1_000;
    const {client,requests}=fake(new Error('overloaded'),answer([picks([{sku:'HN-12-13-G8',reason:'The nut.'}])]));
    const warn=vi.fn();
    const picker=claudeSuggestionPicker({client,now:()=>now,warn});
    await expect(picker(INPUT)).rejects.toThrow(/overloaded/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('overloaded'));
    await expect(picker(INPUT)).rejects.toThrow(/paused/);
    expect(requests).toHaveLength(1);
    now+=PICKER_BACKOFF_MS;
    expect(await picker(INPUT)).toEqual([{sku:'HN-12-13-G8',reason:'The nut.'}]);
  });
});

describe('picksFrom',()=>{
  it('reads the picks from the tool call, and nothing from text or a malformed call',()=>{
    expect(picksFrom(answer([{type:'text',text:'Here you go',citations:null} as Anthropic.ContentBlock,picks([{sku:'A',reason:'r'},{sku:7},{nope:true}])])))
      .toEqual([{sku:'A',reason:'r'}]);
    expect(picksFrom(answer([{type:'text',text:'HN-12-13-G8',citations:null} as Anthropic.ContentBlock]))).toEqual([]);
    expect(picksFrom(answer([picks('nope')]))).toEqual([]);
  });
});

describe('suggestionPicker',()=>{
  it('is Claude in live mode and none in scripted mode (no key, or QUERENT_SCRIPTED=1)',()=>{
    expect(suggestionPicker({})).toBeUndefined();
    expect(suggestionPicker({ANTHROPIC_API_KEY:'test-key',QUERENT_SCRIPTED:'1'})).toBeUndefined();
    expect(suggestionPicker({ANTHROPIC_API_KEY:'test-key'})).toBeTypeOf('function');
  });
});
