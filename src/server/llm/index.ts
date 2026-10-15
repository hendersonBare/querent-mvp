import 'server-only';
import {anthropicClient,llmMode,type LlmMode,type MessagesClient} from './client';
import {createLiveJudge,JUDGE_TIMEOUT_MS} from './judge';
import {createLiveParser} from './parser';
import {createScriptedJudge} from './scripted-judge';
import {createScriptedParser} from './scripted-parser';
import {JUDGE_ERROR,withinCandidates} from './verdicts';
import type {Judge,JudgeCandidate,JudgeVerdict,Parser} from './types';

// The LLM entry points for the quote tool: the parser and judge for this deployment (live Claude, or
// the scripted fixtures when QUERENT_SCRIPTED=1 or no key is set), and judgeAll, which judges a
// batch of lines with bounded concurrency and a per-call timeout. A failed or timed-out line
// degrades to No match (judge_error); the batch never fails.

export type {Judge,JudgeCandidate,JudgeOptions,JudgeVerdict,ParsedRow,ParseInput,ParseResult,Parser} from './types';
export {DEFAULT_MODEL,llmMode,model,type LlmMode} from './client';
export {JUDGE_ERROR,NO_CANDIDATES,NOT_IN_CANDIDATES} from './verdicts';
export {MAX_PDF_BYTES,MAX_ROWS,PARSE_ERROR,PDF_TOO_LARGE_ERROR,SERVICE_ERROR,TOO_MANY_ROWS_ERROR} from './rows';
export {PDF_FIXTURE_MISSING_ERROR} from './scripted-parser';

type Env=Record<string,string|undefined>;

/** A client that is created on its first request, from `env`. */
function lazyClient(env:Env):MessagesClient{
  return {messages:{create:(body,options)=>anthropicClient(env).messages.create(body,options)}};
}

export function getParser(env:Env=process.env):Parser&{readonly mode:LlmMode}{
  const mode=llmMode(env);
  const parser=mode==='live'?createLiveParser({client:lazyClient(env)}):createScriptedParser();
  return {mode,parse:input=>parser.parse(input)};
}

export function getJudge(env:Env=process.env):Judge&{readonly mode:LlmMode}{
  const mode=llmMode(env);
  const judge=mode==='live'?createLiveJudge({client:lazyClient(env)}):createScriptedJudge();
  return {mode,judge:(line,candidates,options)=>judge.judge(line,candidates,options)};
}

export interface JudgeTask {line:{description:string;rawText:string};candidates:JudgeCandidate[]}

export interface JudgeAllOptions {
  /** Calls in flight at once (default 4). */
  concurrency?:number;
  /** Per-line limit in ms (default 30 000); the call is aborted and the line becomes judge_error. */
  timeoutMs?:number;
  /** Called after each line with (done, total). */
  onProgress?:(done:number,total:number)=>void;
}

/** Judges every line; verdicts come back in input order, one per line. */
export async function judgeAll(tasks:JudgeTask[],judge:Judge,{concurrency=4,timeoutMs=JUDGE_TIMEOUT_MS,onProgress}:JudgeAllOptions={}):Promise<JudgeVerdict[]>{
  const verdicts:JudgeVerdict[]=new Array(tasks.length);
  let next=0,done=0;
  const worker=async()=>{
    while(next<tasks.length){
      const i=next++;
      verdicts[i]=await judgeOne(tasks[i],judge,timeoutMs);
      done++;
      try{onProgress?.(done,tasks.length);}catch{/* a progress listener never fails the batch */}
    }
  };
  const workers=Math.min(tasks.length,Math.max(1,Math.floor(concurrency)));
  await Promise.all(Array.from({length:workers},worker));
  return verdicts;
}

const isVerdict=(value:unknown):value is JudgeVerdict=>typeof value==='object'&&value!==null
  &&(typeof (value as JudgeVerdict).sku==='string'||(value as JudgeVerdict).sku===null)&&typeof (value as JudgeVerdict).reason==='string';

async function judgeOne(task:JudgeTask,judge:Judge,timeoutMs:number):Promise<JudgeVerdict>{
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  const timedOut=new Promise<JudgeVerdict>(resolve=>{
    timer=setTimeout(()=>{controller.abort();resolve({sku:null,reason:JUDGE_ERROR});},timeoutMs);
  });
  try{
    const verdict=await Promise.race([Promise.resolve().then(()=>judge.judge(task.line,task.candidates,{signal:controller.signal})),timedOut]);
    return isVerdict(verdict)?withinCandidates(verdict,task.candidates):{sku:null,reason:JUDGE_ERROR};
  }catch{
    return {sku:null,reason:JUDGE_ERROR};
  }finally{
    clearTimeout(timer);
  }
}
