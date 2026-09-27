import type Anthropic from '@anthropic-ai/sdk';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {ChipFacts} from './facts';

// Claude's chip wording (task 3.6) against a mocked Anthropic SDK: never the real API. Each test
// scripts Claude's answer and checks the request, the wording kept, and every fallback to the
// templates (null entries: wordUpsells keeps the template for those).

const sdk=vi.hoisted(()=>({constructed:[] as unknown[],create:vi.fn()}));
vi.mock('@anthropic-ai/sdk',()=>({default:class{
  messages={create:sdk.create};
  constructor(options:unknown){sdk.constructed.push(options);}
}}));

const {WORDING_TOOL,WRITER_BACKOFF_MS,acceptableWording,claudeChipWriter,upsellWriter,wordingFrom}=await import('./claude');

afterEach(()=>{vi.unstubAllEnvs();sdk.create.mockReset();});

const NUT:ChipFacts={id:'matching_fastener:HN-12-13-G8',kind:'matching_fastener',item:{sku:'HN-12-13-G8',description:'Hex nut 1/2-13, Grade 8, yellow zinc',pack:'Box of 100'},qty:5,
  anchor:{sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc'},history_months:12,
  template:{title:'Hex nut 1/2-13, Grade 8, yellow zinc (box of 100)',reason:'Matches the 1/2-13 Grade 8 bolts: 5 boxes of 100 cover all 500.'},
  part:'nut',bolt:{diameter:'1/2',thread:'13',grade:'8'},bolt_pieces:500,pack_pieces:100,history:{orders_together:5,anchor_orders:5}};
const WHEELS:ChipFacts={id:'full_case:CW-45-045-T1',kind:'full_case',item:{sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25'},qty:8,
  anchor:{sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1'},history_months:12,
  template:{title:'Bump cut-off wheels to 8 boxes (2 full cases)',reason:'A case holds 4 boxes, so 6 leaves a broken case.'},
  case_qty:4,from_qty:6,to_qty:8,cases:2};
const GLASSES:ChipFacts={id:'bought_together:SG-CLR-AF',kind:'bought_together',item:{sku:'SG-CLR-AF',description:'Safety glasses, clear anti-fog',pack:'Box of 12'},qty:2,
  anchor:{sku:'GLV-N8-L-1000',description:'Nitrile disposable gloves, 8 mil, black, size L'},history_months:12,
  template:{title:'Safety glasses, clear anti-fog (box of 12)',reason:'Bought with nitrile disposable gloves on 2 of the 4 orders that had them in the last 12 months.'},
  orders_together:2,anchor_orders:4};

let ids=0;
const answer=(content:Anthropic.ContentBlock[],stop_reason:Anthropic.StopReason='tool_use'):Anthropic.Message=>({
  id:`msg_${++ids}`,type:'message',role:'assistant',model:'claude-sonnet-5',content,stop_reason,stop_sequence:null,
  usage:{input_tokens:10,output_tokens:10,cache_creation_input_tokens:null,cache_read_input_tokens:null,server_tool_use:null,service_tier:null},
} as Anthropic.Message);
const wording=(chips:{id:string;title:string;reason:string}[]):Anthropic.ContentBlock=>({type:'tool_use',id:`toolu_${++ids}`,name:WORDING_TOOL.name,input:{chips}});
const worded=(chip:ChipFacts,title=`${chip.item.description}, written`,reason=`Why ${chip.item.sku}, written.`)=>({id:chip.id,title,reason});

/** A fake client answering with `turns` in order (a thrown Error is thrown), recording each request and its options. */
function fakeClaude(...turns:(Anthropic.Message|Error)[]){
  const requests:{body:Anthropic.MessageCreateParamsNonStreaming;options?:Anthropic.RequestOptions}[]=[];
  const client={messages:{create:vi.fn(async(body:Anthropic.MessageCreateParamsNonStreaming,options?:Anthropic.RequestOptions)=>{
    requests.push({body:structuredClone(body),options});
    const next=turns.shift();
    if(!next)throw new Error('Claude was called more times than the test scripted');
    if(next instanceof Error)throw next;
    return next;
  })}};
  return {client,requests};
}

describe('the request to Claude',()=>{
  it('uses ANTHROPIC_MODEL, else claude-sonnet-5, with a short timeout and no retries',async()=>{
    vi.stubEnv('ANTHROPIC_MODEL','');
    const {client,requests}=fakeClaude(answer([wording([worded(NUT)])]),answer([wording([worded(NUT)])]));
    await claudeChipWriter({client})([NUT]);
    expect(requests[0].body.model).toBe('claude-sonnet-5');
    expect(requests[0].options).toEqual({timeout:8_000,maxRetries:0});
    vi.stubEnv('ANTHROPIC_MODEL','claude-opus-5');
    await claudeChipWriter({client})([NUT]);
    expect(requests[1].body.model).toBe('claude-opus-5');
  });

  it('asks once for every chip through the wording tool, with the facts and nothing about money',async()=>{
    const {client,requests}=fakeClaude(answer([wording([worded(NUT),worded(WHEELS),worded(GLASSES)])]));
    await claudeChipWriter({client,model:'m'})([NUT,WHEELS,GLASSES]);
    expect(requests).toHaveLength(1);
    const {body}=requests[0];
    expect(body.tools).toEqual([WORDING_TOOL]);
    expect(body.tool_choice).toEqual({type:'auto',disable_parallel_tool_use:true});
    expect(body.system).toMatch(/Never mention or guess a price, cost, margin, profit/);
    const content=body.messages[0].content as string;
    expect(JSON.parse(content.slice(content.indexOf('\n')+1))).toEqual([NUT,WHEELS,GLASSES]);
    expect(content).not.toMatch(/cost|price|margin|profit|gp_gain|\$/i);
  });

  it('refuses facts that carry cost, price or GP, before any request',async()=>{
    const {client}=fakeClaude();
    const leaky={...NUT,unit_cost:9.8,unit_price:19.95,gp_gain:50.75} as unknown as ChipFacts;
    await expect(claudeChipWriter({client})([WHEELS,leaky])).rejects.toThrow(/\[1\]\.unit_cost, \[1\]\.unit_price, \[1\]\.gp_gain/);
    await expect(claudeChipWriter({client})([{...WHEELS,item:{...WHEELS.item,list_price:46}} as unknown as ChipFacts])).rejects.toThrow(/item\.list_price/);
    expect(client.messages.create).not.toHaveBeenCalled();
  });
});

describe('the wording kept',()=>{
  it('returns Claude\'s wording per chip, in order, whatever order Claude answers in',async()=>{
    const {client}=fakeClaude(answer([{type:'text',text:'Here you go.',citations:null},wording([worded(GLASSES,'Safety glasses, anti-fog (box of 12)','Often on the same orders as the gloves: 2 of the last 4.'),worded(NUT)])]));
    expect(await claudeChipWriter({client})([NUT,WHEELS,GLASSES])).toEqual([
      {title:`${NUT.item.description}, written`,reason:`Why ${NUT.item.sku}, written.`},
      null,
      {title:'Safety glasses, anti-fog (box of 12)',reason:'Often on the same orders as the gloves: 2 of the last 4.'},
    ]);
  });

  it('drops wording that talks money, runs long, breaks lines or is blank (the template stays)',()=>{
    const ok={title:'Hex nuts to match',reason:'They match the Grade 8 bolts.'};
    expect(acceptableWording({title:'  Hex nuts to match ',reason:' They match the Grade 8 bolts. '})).toEqual(ok);
    for(const reason of ['Only $19.95 a box.','Adds 51% margin.','Better price at a full case.','Saves on cost.','A discount applies.','Profit goes up.','Line one.\nLine two.','x'.repeat(241),'  '])
      expect(acceptableWording({...ok,reason})).toBeNull();
    expect(acceptableWording({...ok,title:'y'.repeat(91)})).toBeNull();
  });

  it('keeps the templates when Claude answers in text, refuses, calls another tool or sends malformed input',async()=>{
    const cases=[
      answer([{type:'text',text:'Sure! Hex nuts would pair well.',citations:null}],'end_turn'),
      answer([],'refusal'),
      answer([{type:'tool_use',id:'toolu_x',name:'other_tool',input:{chips:[worded(NUT)]}}]),
      answer([{type:'tool_use',id:'toolu_y',name:WORDING_TOOL.name,input:{chips:'nope'}}]),
    ];
    for(const message of cases)expect(wordingFrom(message).size).toBe(0);
    const {client}=fakeClaude(cases[0]);
    expect(await claudeChipWriter({client})([NUT])).toEqual([null]);
  });
});

describe('cache and failures',()=>{
  it('asks again only for chips whose facts changed (per model)',async()=>{
    const {client,requests}=fakeClaude(answer([wording([worded(NUT),worded(WHEELS)])]),answer([wording([worded(NUT,'Hex nuts, 6 boxes','Matches the bolts.')])]));
    const writer=claudeChipWriter({client,model:'m'});
    const first=await writer([NUT,WHEELS]);
    expect(await writer([NUT,WHEELS])).toEqual(first);
    expect(requests).toHaveLength(1);
    const moreNuts={...NUT,qty:6};
    expect(await writer([moreNuts,WHEELS])).toEqual([{title:'Hex nuts, 6 boxes',reason:'Matches the bolts.'},first[1]]);
    expect(requests).toHaveLength(2);
    expect(JSON.parse((requests[1].body.messages[0].content as string).split('\n')[1])).toEqual([moreNuts]);
  });

  it('on any error keeps the templates, warns, and pauses before asking Claude again',async()=>{
    let clock=1_000_000;
    const warn=vi.fn();
    const {client,requests}=fakeClaude(new Error('Request timed out.'),answer([wording([worded(NUT)])]));
    const writer=claudeChipWriter({client,now:()=>clock,warn});
    expect(await writer([NUT])).toEqual([null]);
    expect(warn).toHaveBeenCalledWith('Upsell wording: Claude failed, using the templates (Request timed out.).');
    clock+=WRITER_BACKOFF_MS-1;
    expect(await writer([NUT])).toEqual([null]);
    expect(requests).toHaveLength(1);
    clock+=1;
    expect(await writer([NUT])).toEqual([worded(NUT)].map(({title,reason})=>({title,reason})));
    expect(requests).toHaveLength(2);
  });
});

describe('upsellWriter (live mode only)',()=>{
  it('is off in scripted mode: QUERENT_SCRIPTED=1 or no ANTHROPIC_API_KEY',()=>{
    expect(upsellWriter({ANTHROPIC_API_KEY:''})).toBeUndefined();
    expect(upsellWriter({ANTHROPIC_API_KEY:'sk-test',QUERENT_SCRIPTED:'1'})).toBeUndefined();
  });

  it('is Claude in live mode, on the SDK client with the short timeout (mocked here)',async()=>{
    sdk.create.mockResolvedValueOnce(answer([wording([worded(WHEELS)])]));
    const writer=upsellWriter({ANTHROPIC_API_KEY:'sk-test',ANTHROPIC_MODEL:'claude-sonnet-5'})!;
    expect(upsellWriter({ANTHROPIC_API_KEY:'sk-test'})).toBe(writer);
    expect(await writer([WHEELS])).toEqual([{title:worded(WHEELS).title,reason:worded(WHEELS).reason}]);
    expect(sdk.constructed).toEqual([{timeout:8_000,maxRetries:0}]);
    expect(sdk.create).toHaveBeenCalledWith(expect.objectContaining({model:'claude-sonnet-5'}),{timeout:8_000,maxRetries:0});
  });
});
