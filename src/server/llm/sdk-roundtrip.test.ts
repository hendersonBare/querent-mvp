// @vitest-environment node
import Anthropic from '@anthropic-ai/sdk';
import {createServer,type IncomingMessage,type Server,type ServerResponse} from 'node:http';
import type {AddressInfo} from 'node:net';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {judgeAll} from './index';
import {createLiveJudge,JUDGE_ERROR} from './judge';
import {createLiveParser} from './parser';

// The live parser and judge through the real SDK client, against a local stand-in for the Messages
// API (127.0.0.1 only, never the network): the request the SDK sends, and how answers, HTTP errors
// and aborts come back.

type Handler=(body:Record<string,unknown>,res:ServerResponse)=>void;
let server:Server,baseURL:string,handler:Handler;
const bodies:Record<string,unknown>[]=[];

const reply=(res:ServerResponse,status:number,json:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(json));};
const toolMessage=(name:string,input:unknown)=>({id:'msg_1',type:'message',role:'assistant',model:'test-model',stop_reason:'tool_use',stop_sequence:null,
  content:[{type:'tool_use',id:'toolu_1',name,input}],usage:{input_tokens:1,output_tokens:1}});

beforeAll(async()=>{
  server=createServer((req:IncomingMessage,res:ServerResponse)=>{
    let raw='';
    req.on('data',chunk=>{raw+=chunk;});
    req.on('end',()=>{const body=JSON.parse(raw);bodies.push(body);handler(body,res);});
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  baseURL=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(()=>new Promise<void>(resolve=>server.close(()=>resolve())));

const sdk=(maxRetries=0)=>new Anthropic({apiKey:'test-key',baseURL,maxRetries,timeout:5_000});

describe('through the real SDK',()=>{
  it('parses a pasted list',async()=>{
    bodies.length=0;
    handler=(_body,res)=>reply(res,200,toolMessage('record_rows',{rows:[{rawText:'12x10x8 boxes qty 10',description:'12x10x8 boxes',quantity:10,unit:null,suppliersSku:null,quantityUnclear:false}]}));
    const result=await createLiveParser({client:sdk(),model:'test-model'}).parse({kind:'text',text:'12x10x8 boxes qty 10'});
    expect(result).toEqual({ok:true,rows:[{rawText:'12x10x8 boxes qty 10',description:'12x10x8 boxes',quantity:10,unit:null,suppliersSku:null,quantityUnclear:false}]});
    expect(bodies[0]).toMatchObject({model:'test-model',tool_choice:{type:'auto',disable_parallel_tool_use:true},tools:[{name:'record_rows'}]});
  });

  it('sends a PDF as a base64 document block',async()=>{
    bodies.length=0;
    handler=(_body,res)=>reply(res,200,toolMessage('record_rows',{rows:[]}));
    await createLiveParser({client:sdk(),model:'test-model'}).parse({kind:'pdf',data:new TextEncoder().encode('%PDF-1.4 x')});
    const content=(bodies[0].messages as {content:{type:string;source?:unknown}[]}[])[0].content;
    expect(content[0]).toEqual({type:'document',source:{type:'base64',media_type:'application/pdf',data:Buffer.from('%PDF-1.4 x').toString('base64')}});
  });

  it('judges a line, and fails closed on an HTTP error',async()=>{
    handler=(_body,res)=>reply(res,200,toolMessage('choose_candidate',{sku:'A1',reason:'Same.'}));
    const judge=createLiveJudge({client:sdk(),model:'test-model'});
    expect(await judge.judge({description:'x',rawText:'x'},[{sku:'A1',description:'x'}])).toEqual({sku:'A1',reason:'Same.'});
    handler=(_body,res)=>reply(res,529,{type:'error',error:{type:'overloaded_error',message:'Overloaded'}});
    expect(await judge.judge({description:'x',rawText:'x'},[{sku:'A1',description:'x'}])).toEqual({sku:null,reason:JUDGE_ERROR});
  });

  it('aborts a slow judge call at the judgeAll timeout',async()=>{
    let closed=false;
    handler=(_body,res)=>{res.on('close',()=>{closed=true;});};
    const judge=createLiveJudge({client:sdk(),model:'test-model'});
    const started=Date.now();
    const out=await judgeAll([{line:{description:'x',rawText:'x'},candidates:[{sku:'A1',description:'x'}]}],judge,{timeoutMs:150});
    expect(out).toEqual([{sku:null,reason:JUDGE_ERROR}]);
    expect(Date.now()-started).toBeLessThan(2_000);
    await new Promise(resolve=>setTimeout(resolve,50));
    expect(closed).toBe(true);
  });
});
