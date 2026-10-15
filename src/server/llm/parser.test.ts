// @vitest-environment node
import Anthropic from '@anthropic-ai/sdk';
import {describe,expect,it} from 'vitest';
import {createLiveParser,PARSER_SYSTEM_PROMPT,RECORD_ROWS_TOOL} from './parser';
import {MAX_PDF_BYTES,MAX_ROWS,PARSE_ERROR,SERVICE_ERROR,TOO_MANY_ROWS_ERROR} from './rows';
import {fakeClient,textReply,toolReply} from './testing';

const row=(over:Record<string,unknown>={})=>({rawText:'S-4128 12 x 10 x 8" boxes 10 bundles',description:'12 x 10 x 8" corrugated boxes',quantity:10,unit:'bundle',suppliersSku:'S-4128',quantityUnclear:false,...over});
const parserWith=(...answers:Parameters<typeof fakeClient>)=>{
  const client=fakeClient(...answers);
  return {client,parser:createLiveParser({client,model:'test-model'})};
};

describe('live parser: request shape',()=>{
  it('sends text as a text block, with the record_rows tool, auto tool choice and the system prompt',async()=>{
    const {client,parser}=parserWith(toolReply('record_rows',{rows:[row()]}));
    await parser.parse({kind:'text',text:'S-4128 12 x 10 x 8" boxes 10 bundles'});
    const {body,options}=client.requests[0];
    expect(body.model).toBe('test-model');
    expect(body.system).toBe(PARSER_SYSTEM_PROMPT);
    expect(body.tools).toEqual([RECORD_ROWS_TOOL]);
    // Forced tool choice (any/tool) is rejected by current models, so the tool is steered by the prompt.
    expect(body.tool_choice).toEqual({type:'auto',disable_parallel_tool_use:true});
    expect(body.messages).toHaveLength(1);
    const content=body.messages[0].content as Anthropic.ContentBlockParam[];
    expect(content.every(b=>b.type==='text')).toBe(true);
    expect(JSON.stringify(content)).toContain('S-4128 12 x 10 x 8\\" boxes 10 bundles');
    expect(options?.timeout).toBeGreaterThan(0);
  });

  it('sends a PDF as a base64 document block before the instruction',async()=>{
    const {client,parser}=parserWith(toolReply('record_rows',{rows:[row()]}));
    const data=new Uint8Array([37,80,68,70,45,49,46,52,10]);
    await parser.parse({kind:'pdf',data,filename:'po.pdf'});
    const content=client.requests[0].body.messages[0].content as Anthropic.ContentBlockParam[];
    expect(content[0]).toEqual({type:'document',source:{type:'base64',media_type:'application/pdf',data:Buffer.from(data).toString('base64')}});
    expect(content[1].type).toBe('text');
    expect(content).toHaveLength(2);
  });

  it('declares a rows array with every ParsedRow field in the tool schema',()=>{
    const rows=(RECORD_ROWS_TOOL.input_schema.properties as Record<string,{items:{required:string[]}}>).rows;
    expect(rows.items.required.sort()).toEqual(['description','quantity','quantityUnclear','rawText','suppliersSku','unit']);
    expect(RECORD_ROWS_TOOL.name).toBe('record_rows');
  });

  it('tells the model to extract every product line, verbatim, without inventing rows or asking questions',()=>{
    for(const phrase of [/every/i,/verbatim/i,/never invent/i,/null/i,/headers/i,/totals/i,/addresses/i,/prices/i,/never ask/i])expect(PARSER_SYSTEM_PROMPT).toMatch(phrase);
  });
});

describe('live parser: validation',()=>{
  it('returns the validated rows',async()=>{
    const {parser}=parserWith(toolReply('record_rows',{rows:[row(),row({rawText:'Tape',description:'Tape',quantity:null,unit:null,suppliersSku:null,quantityUnclear:true})]}));
    const result=await parser.parse({kind:'text',text:'x'});
    expect(result).toEqual({ok:true,rows:[row(),{rawText:'Tape',description:'Tape',quantity:null,unit:null,suppliersSku:null,quantityUnclear:true}]});
  });

  it('marks a missing, zero or negative quantity as unclear',async()=>{
    const {parser}=parserWith(toolReply('record_rows',{rows:[row({quantity:null,quantityUnclear:false}),row({quantity:0}),row({quantity:-3})]}));
    const result=await parser.parse({kind:'text',text:'x'});
    expect(result.ok&&result.rows.map(r=>[r.quantity,r.quantityUnclear])).toEqual([[null,true],[null,true],[null,true]]);
  });

  it('trims fields and turns blank optional strings into null',async()=>{
    const {parser}=parserWith(toolReply('record_rows',{rows:[row({rawText:'  Tape  ',description:' Tape ',unit:' ',suppliersSku:''})]}));
    const result=await parser.parse({kind:'text',text:'x'});
    expect(result.ok&&result.rows[0]).toMatchObject({rawText:'Tape',description:'Tape',unit:null,suppliersSku:null});
  });

  it.each([
    ['rows is not an array',{rows:'nope'}],
    ['a row has a string quantity',{rows:[row({quantity:'10'})]}],
    ['a row has no rawText',{rows:[{description:'x',quantity:1,unit:null,suppliersSku:null,quantityUnclear:false}]}],
    ['the input is empty',{}],
  ])('fails with a clear message when %s',async(_,input)=>{
    const {parser}=parserWith(toolReply('record_rows',input));
    expect(await parser.parse({kind:'text',text:'x'})).toEqual({ok:false,error:PARSE_ERROR});
  });

  it('fails clearly when the model answers in text, refuses, runs out of tokens or calls another tool',async()=>{
    for(const answer of [textReply('Here are your rows'),toolReply('record_rows',{rows:[row()]},{stopReason:'refusal'}),toolReply('record_rows',{rows:[row()]},{stopReason:'max_tokens'}),toolReply('other_tool',{rows:[row()]})]){
      const {parser}=parserWith(answer);
      expect(await parser.parse({kind:'text',text:'x'})).toEqual({ok:false,error:PARSE_ERROR});
    }
  });

  it('says the list could not be read on a 400 (e.g. an unreadable PDF), and the service is unavailable otherwise',async()=>{
    const bad=new Anthropic.BadRequestError(400,{type:'error',error:{type:'invalid_request_error',message:'bad pdf'}},'bad pdf',new Headers());
    expect(await parserWith(bad).parser.parse({kind:'pdf',data:new Uint8Array([1])})).toEqual({ok:false,error:PARSE_ERROR});
    expect(await parserWith(new Error('socket hang up')).parser.parse({kind:'text',text:'x'})).toEqual({ok:false,error:SERVICE_ERROR});
  });

  it('is clear, non-technical copy',()=>{
    expect(PARSE_ERROR).toBe('Could not read that list. Try pasting it as text.');
    for(const message of [PARSE_ERROR,SERVICE_ERROR,TOO_MANY_ROWS_ERROR])expect(message).not.toMatch(/json|schema|tool|\bapi\b|zod|error code|\b[45]\d\d\b/i);
  });
});

describe('live parser: caps',()=>{
  it(`accepts ${MAX_ROWS} rows and refuses more`,async()=>{
    const many=(n:number)=>({rows:Array.from({length:n},(_,i)=>row({rawText:`line ${i}`}))});
    const ok=await parserWith(toolReply('record_rows',many(MAX_ROWS))).parser.parse({kind:'text',text:'x'});
    expect(ok.ok&&ok.rows).toHaveLength(MAX_ROWS);
    expect(await parserWith(toolReply('record_rows',many(MAX_ROWS+1))).parser.parse({kind:'text',text:'x'})).toEqual({ok:false,error:TOO_MANY_ROWS_ERROR});
    expect(TOO_MANY_ROWS_ERROR).toMatch(/more than 200 lines/);
  });

  it('refuses a PDF over 4 MB and empty input without calling the API',async()=>{
    const {client,parser}=parserWith(toolReply('record_rows',{rows:[row()]}));
    const big=await parser.parse({kind:'pdf',data:new Uint8Array(MAX_PDF_BYTES+1)});
    expect(big.ok).toBe(false);
    expect(await parser.parse({kind:'text',text:'  \n  '})).toEqual({ok:true,rows:[]});
    expect(client.requests).toHaveLength(0);
  });
});
