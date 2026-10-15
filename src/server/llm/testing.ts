import type Anthropic from '@anthropic-ai/sdk';
import type {MessagesClient} from './client';

// Test helpers for the live parser and judge: a fake SDK client whose messages.create records each
// request and answers from a script, so no test ever reaches the network.

export interface RecordedRequest {body:Anthropic.MessageCreateParamsNonStreaming;options?:Anthropic.RequestOptions}
export type FakeAnswer=Anthropic.Message|Error|((request:RecordedRequest)=>Anthropic.Message|Error|Promise<Anthropic.Message>);

/** An assistant message holding one tool_use block (after an optional thinking block). */
export function toolReply(name:string,input:unknown,{stopReason='tool_use',thinking=true}:{stopReason?:Anthropic.StopReason;thinking?:boolean}={}):Anthropic.Message{
  const content=[
    ...(thinking?[{type:'thinking',thinking:'',signature:'sig'}]:[]),
    {type:'tool_use',id:'toolu_1',name,input},
  ];
  return message(content,stopReason);
}

/** An assistant message holding text only. */
export function textReply(text:string,stopReason:Anthropic.StopReason='end_turn'):Anthropic.Message{
  return message([{type:'text',text,citations:null}],stopReason);
}

function message(content:unknown[],stopReason:Anthropic.StopReason):Anthropic.Message{
  return {
    id:'msg_test',type:'message',role:'assistant',model:'test-model',content,stop_reason:stopReason,stop_sequence:null,
    usage:{input_tokens:1,output_tokens:1,cache_creation_input_tokens:null,cache_read_input_tokens:null,server_tool_use:null,service_tier:null,cache_creation:null},
  } as unknown as Anthropic.Message;
}

/** A fake client: answers come from `answers` in order (the last one repeats). */
export function fakeClient(...answers:FakeAnswer[]):MessagesClient&{requests:RecordedRequest[]}{
  const requests:RecordedRequest[]=[];
  let next=0;
  return {
    requests,
    messages:{
      async create(body,options){
        const request={body,options};
        requests.push(request);
        const answer=answers[Math.min(next++,answers.length-1)];
        const out=typeof answer==='function'?await answer(request):answer;
        if(out instanceof Error)throw out;
        return out;
      },
    },
  };
}
