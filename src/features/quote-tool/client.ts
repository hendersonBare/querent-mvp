import type {MatchRun,ProgressEvent,SaveQuoteRequest,ScoredItem,MatchStreamEvent} from './types';

// The browser's side of the quote tool's APIs: the match stream (NDJSON, read as it arrives), the Swap
// search and Save. Each takes an optional fetch for tests. Client-safe.

type Fetcher=(input:string,init?:RequestInit)=>Promise<Response>;
const defaultFetch:Fetcher=(input,init)=>fetch(input,init);

export const CONNECTION_ERROR='Could not reach the server. Check your connection and try again.';
export const GENERIC_ERROR='Something went wrong. Try again.';

/** Calls onEvent with each JSON line of an NDJSON body as it arrives. */
export async function readNdjson(body:ReadableStream<Uint8Array>,onEvent:(event:unknown)=>void):Promise<void>{
  const reader=body.getReader();
  const decoder=new TextDecoder();
  let buffer='';
  const flush=(final:boolean)=>{
    const lines=buffer.split('\n');
    buffer=final?'':lines.pop()!;
    for(const line of lines)if(line.trim())onEvent(JSON.parse(line));
  };
  for(;;){
    const {value,done}=await reader.read();
    if(done)break;
    buffer+=decoder.decode(value,{stream:true});
    flush(false);
  }
  buffer+=decoder.decode();
  flush(true);
}

async function errorOf(response:Response):Promise<string>{
  try{
    const body=await response.json() as {error?:unknown};
    if(typeof body.error==='string'&&body.error)return body.error;
  }catch{/* not JSON */}
  return GENERIC_ERROR;
}

export type MatchOutcome={ok:true;run:MatchRun}|{ok:false;error:string};

/** Posts the list (a form with `text` or `file`) and follows the stream to its result or error. */
export async function requestMatch(form:FormData,onProgress:(event:ProgressEvent)=>void,{fetcher=defaultFetch,signal}:{fetcher?:Fetcher;signal?:AbortSignal}={}):Promise<MatchOutcome>{
  let response:Response;
  try{
    response=await fetcher('/api/quote-tool/match',{method:'POST',body:form,signal});
  }catch{
    return {ok:false,error:CONNECTION_ERROR};
  }
  if(!response.ok||!response.body)return {ok:false,error:await errorOf(response)};
  let outcome:MatchOutcome|null=null;
  try{
    await readNdjson(response.body,raw=>{
      const event=raw as MatchStreamEvent;
      if(event.type==='progress')onProgress({stage:event.stage,done:event.done,total:event.total});
      else if(event.type==='result')outcome={ok:true,run:event.run};
      else if(event.type==='error')outcome={ok:false,error:event.message};
    });
  }catch{
    return outcome??{ok:false,error:CONNECTION_ERROR};
  }
  return outcome??{ok:false,error:GENERIC_ERROR};
}

/**
 * The Swap search: up to 10 catalog items for the query (2 characters or more). With the line's
 * description, each item says whether it fully accounts for it (`accounted`, B10b).
 */
export async function searchCatalog(q:string,{fetcher=defaultFetch,signal,line}:{fetcher?:Fetcher;signal?:AbortSignal;line?:string}={}):Promise<ScoredItem[]>{
  const response=await fetcher(`/api/catalog/search?q=${encodeURIComponent(q)}${line?`&line=${encodeURIComponent(line)}`:''}`,{signal});
  if(!response.ok)throw new Error(await errorOf(response));
  return ((await response.json()) as {items:ScoredItem[]}).items;
}

/** Saves the quote; resolves with its id, or rejects with a message to show. */
export async function saveQuote(body:SaveQuoteRequest,{fetcher=defaultFetch}:{fetcher?:Fetcher}={}):Promise<{id:string}>{
  let response:Response;
  try{
    response=await fetcher('/api/quotes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  }catch{
    throw new Error(CONNECTION_ERROR);
  }
  if(!response.ok)throw new Error(await errorOf(response));
  return await response.json() as {id:string};
}
