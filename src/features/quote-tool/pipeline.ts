import {judgeAll} from '@/server/llm';
import {JUDGE_ERROR} from '@/server/llm/verdicts';
import type {Judge,JudgeCandidate,JudgeVerdict,ParsedRow,ParseInput,ParseResult,Parser} from '@/server/llm/types';
import {decide,packContainersOf,packLabel,retrieve,type MatchRule,type Retrieval} from '@/server/matching';
import type {Candidate} from '@/server/matching/retrieve';
import type {CatalogItem} from '@/server/repository/types';
import {nullSkuMap,type SupplierSkuMap} from './sku-map';
import {pricingUnit} from './units';
import {type LineEligibility,type LineReason,type MatchCounts,type ProgressEvent,type ResultItem,type ResultLine,type ScoredItem} from './types';

// The quote tool's pipeline (docs/boxt/plan.md product rule 3), as pure orchestration: everything it
// talks to is passed in, so tests run it with a fake parser, judge and catalog.
//
//   1. Parse the list (text or PDF) into rows, within parseTimeoutMs (the call is aborted after it).
//   2. Retrieve each row's candidates from the catalog by its description (the scorer; description
//      only: a supplier SKU is looked up in the SupplierSkuMap seam but never decides an outcome).
//   3. Judge only the rows whose retrieval clears the level's rule (a row that does not clear is No
//      match whatever a judge would say, so asking would change nothing), with bounded concurrency, a
//      per-line timeout and an overall deadline; a failed, late or malformed answer is No match.
//   4. Decide with decide() (the evaluation suite uses the same rule), so every row gets exactly one
//      outcome, and a matched item is always one of that row's catalog candidates.
//
// Nothing here logs or stores the customer's text.

/** How long the parser may take before the run gives up (well inside the route's maxDuration of 300 s). */
export const PARSE_TIMEOUT_MS=150_000;
/** The whole run's budget from its start: judging stops here and lines not judged by then are No match. */
export const RUN_DEADLINE_MS=270_000;
export const JUDGE_CONCURRENCY=4;
export const JUDGE_TIMEOUT_MS=30_000;
/** Swap candidates and near-misses kept per line. */
export const CANDIDATE_LIMIT=8;
export const NEAR_MISS_LIMIT=5;

export const PARSE_TIMEOUT_ERROR='Reading the list took too long. Try again, or split it into smaller lists.';
export const NO_ROWS_ERROR='No product lines were found in that list.';

export interface PipelineOptions {
  parser:Parser;
  judge:Judge;
  catalog:readonly CatalogItem[];
  /** The organization's strictness level as a rule (matchConfig(level)). */
  config:MatchRule;
  skuMap?:SupplierSkuMap;
  onProgress?:(event:ProgressEvent)=>void;
  judgeConcurrency?:number;
  judgeTimeoutMs?:number;
  parseTimeoutMs?:number;
  /** The run's budget in ms from its start (see RUN_DEADLINE_MS). */
  deadlineMs?:number;
  /** Aborts the run (the request went away). */
  signal?:AbortSignal;
}

export type PipelineResult=
  |{ok:true;lines:ResultLine[];counts:MatchCounts}
  |{ok:false;error:string;timedOut:boolean};

export async function runPipeline(input:ParseInput,options:PipelineOptions):Promise<PipelineResult>{
  const {parser,judge,catalog,config,skuMap=nullSkuMap,signal}=options;
  const progress=(event:ProgressEvent)=>{
    try{options.onProgress?.(event);}catch{/* a progress listener never breaks the run */}
  };
  const deadline=deadlineSignal(options.deadlineMs??RUN_DEADLINE_MS,signal);
  try{
    // 1. Parse.
    progress({stage:'parse',done:0,total:1});
    const parsed=await parseWithin(parser,input,options.parseTimeoutMs??PARSE_TIMEOUT_MS,signal);
    if(parsed==='timeout')return {ok:false,error:PARSE_TIMEOUT_ERROR,timedOut:true};
    if(!parsed.ok)return {ok:false,error:parsed.error,timedOut:false};
    if(parsed.rows.length===0)return {ok:false,error:NO_ROWS_ERROR,timedOut:false};
    progress({stage:'parse',done:1,total:1});
    const rows=parsed.rows;

    // 2. Retrieve, one row at a time, letting the stream flush between rows.
    progress({stage:'match',done:0,total:rows.length});
    const retrievals:Retrieval<CatalogItem>[]=[];
    for(const [i,row] of rows.entries()){
      if(row.suppliersSku)await lookupQuietly(skuMap,row.suppliersSku);
      retrievals.push(retrieve(row.description,catalog,{...config,candidateLimit:CANDIDATE_LIMIT,nearMissLimit:NEAR_MISS_LIMIT}));
      progress({stage:'match',done:i+1,total:rows.length});
      await yieldToEventLoop();
    }

    // 3. Judge the rows that clear.
    const clearing=retrievals.flatMap((retrieval,i)=>retrieval.clears?[i]:[]);
    const verdicts=new Map<number,JudgeVerdict>();
    if(clearing.length>0){
      progress({stage:'judge',done:0,total:clearing.length});
      const answers=await judgeAll(
        clearing.map(i=>({line:{description:rows[i].description,rawText:rows[i].rawText},candidates:judgeCandidates(retrievals[i])})),
        boundedJudge(judge,deadline.signal),
        {concurrency:options.judgeConcurrency??JUDGE_CONCURRENCY,timeoutMs:options.judgeTimeoutMs??JUDGE_TIMEOUT_MS,
          onProgress:(done,total)=>progress({stage:'judge',done,total})},
      );
      clearing.forEach((rowIndex,k)=>verdicts.set(rowIndex,answers[k]));
    }

    // 4. Decide.
    const lines=rows.map((row,i)=>resultLine(i,row,retrievals[i],verdicts.get(i)));
    const matched=lines.filter(l=>l.outcome==='matched').length;
    return {ok:true,lines,counts:{rows:lines.length,matched,unmatched:lines.length-matched,judged:clearing.length}};
  }finally{
    deadline.clear();
  }
}

/** The candidates as the judge sees them: SKU, description, pack label and category, never a price. */
function judgeCandidates(retrieval:Retrieval<CatalogItem>):JudgeCandidate[]{
  return retrieval.candidates.map(({item})=>({sku:item.sku,description:item.description,pack:packLabel(item),category:item.category}));
}

export function toResultItem(item:CatalogItem):ResultItem{
  const pricing=pricingUnit(item.pack,item.caseQty,item);
  return {sku:item.sku,description:item.description,pack:packLabel(item),category:item.category,listPrice:item.listPrice,listPriceUnit:pricing?.unit??null,pricing};
}
const toScored=(c:Candidate<CatalogItem>):ScoredItem=>({...toResultItem(c.item),score:c.score,accounted:c.eligibility.strictEligible});

function resultLine(index:number,row:ParsedRow,retrieval:Retrieval<CatalogItem>,verdict:JudgeVerdict|undefined):ResultLine{
  const decision=decide(retrieval,{sku:verdict?.sku??null});
  const eligibility=eligibilityOf(retrieval);
  const base={
    index,rawText:row.rawText,description:row.description,suppliersSku:row.suppliersSku,packContainers:packContainersOf(row.description),quantity:row.quantity,unit:row.unit,quantityUnclear:row.quantityUnclear,
    candidates:retrieval.candidates.map(toScored),nearMisses:retrieval.nearMisses.map(toScored),
    ...(eligibility?{eligibility}:{}),
  };
  if(decision.outcome==='matched')return {...base,outcome:'matched',reason:'matched',item:toResultItem(decision.item),score:decision.score};
  const reason:LineReason=decision.reason==='judge_none'&&verdict?.reason===JUDGE_ERROR?'judge_error':decision.reason;
  return {...base,outcome:'no_match',reason,score:retrieval.top?.score??0};
}

const MAX_BLOCKERS=10;

/**
 * The retrieval's Strict eligibility ({strictEligible, blockers}) when the matcher reports one (B3b adds
 * it), else undefined. Read defensively: only a boolean and up to 10 strings are passed on.
 */
export function eligibilityOf(retrieval:unknown):LineEligibility|undefined{
  const value=(retrieval as {eligibility?:unknown}|null)?.eligibility;
  if(!value||typeof value!=='object')return undefined;
  const {strictEligible,blockers}=value as {strictEligible?:unknown;blockers?:unknown};
  if(typeof strictEligible!=='boolean')return undefined;
  const list=Array.isArray(blockers)?blockers.filter((b):b is string=>typeof b==='string').slice(0,MAX_BLOCKERS):[];
  return {strictEligible,blockers:list};
}

/** The parse, or 'timeout' once timeoutMs passes (the call is then aborted). */
async function parseWithin(parser:Parser,input:ParseInput,timeoutMs:number,outer?:AbortSignal):Promise<ParseResult|'timeout'>{
  const controller=new AbortController();
  const abort=()=>controller.abort();
  outer?.addEventListener('abort',abort,{once:true});
  let timer:ReturnType<typeof setTimeout>|undefined;
  const timedOut=new Promise<'timeout'>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve('timeout');},timeoutMs);});
  try{
    return await Promise.race([Promise.resolve().then(()=>parser.parse(input,{signal:controller.signal})),timedOut]);
  }finally{
    clearTimeout(timer);
    outer?.removeEventListener('abort',abort);
  }
}

/** A signal that aborts after ms, or with `outer`. */
function deadlineSignal(ms:number,outer?:AbortSignal){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  const abort=()=>controller.abort();
  outer?.addEventListener('abort',abort,{once:true});
  if(outer?.aborted)controller.abort();
  return {signal:controller.signal,clear(){clearTimeout(timer);outer?.removeEventListener('abort',abort);}};
}

/** The judge, refusing once the run's deadline has passed and abandoning a call in flight at it (judgeAll turns both into judge_error). */
function boundedJudge(judge:Judge,deadline:AbortSignal):Judge{
  return {
    judge(line,candidates,options){
      if(deadline.aborted)return Promise.reject(new Error('deadline'));
      const signal=options?.signal?AbortSignal.any([options.signal,deadline]):deadline;
      return new Promise<JudgeVerdict>((resolve,reject)=>{
        const onDeadline=()=>reject(new Error('deadline'));
        deadline.addEventListener('abort',onDeadline,{once:true});
        Promise.resolve().then(()=>judge.judge(line,candidates,{signal}))
          .then(resolve,reject)
          .finally(()=>deadline.removeEventListener('abort',onDeadline));
      });
    },
  };
}

/** The SKU map is a seam only (see sku-map.ts): its answer is not used, and its failure is ignored. */
async function lookupQuietly(skuMap:SupplierSkuMap,suppliersSku:string){
  try{await skuMap.lookup(suppliersSku);}catch{/* ignored */}
}

const yieldToEventLoop=()=>new Promise<void>(resolve=>typeof setImmediate==='function'?setImmediate(resolve):setTimeout(resolve,0));
