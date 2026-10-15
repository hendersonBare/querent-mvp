import catalogJson from '../../data/boxt-catalog.json';
import {LEVELS,STRICTNESS_LEVELS,matchConfig,type StrictnessLevel} from '@/features/settings/strictness';
import {decide,type NoMatchReason} from '@/server/matching/decide';
import type {JudgeCandidate,JudgeVerdict} from '@/server/llm/types';
import {withinCandidates} from '@/server/llm/verdicts';
import {packLabel,productGroup} from '@/server/matching/packaging';
import {retrieve,type Retrieval} from '@/server/matching/retrieve';
import {CASES,type EvalCase} from './cases';
import recording from './judge-recording.json';

// The evaluation runner (BOXT task B3): each case through the same steps as the quote tool's
// pipeline after parsing: retrieve (the real scorer, the real catalog) -> judge -> decide. Two judges:
//   - recorded: the verdicts in judge-recording.json (hand-written to imitate a careful judge that
//     sees only the line and the candidate list; see that file's note);
//   - always-agree: picks the top candidate every time, so a level's safety never rests on the judge.
// Used by eval.test.ts (the build gate) and scripts/eval-report.ts (`npm run eval:report`).

export interface CatalogRow {sku:string;description:string;category:string;pack:string|null;caseQty:number|null;list:number|null;keywords:string}
export const CATALOG:readonly CatalogRow[]=catalogJson as CatalogRow[];

/** judge-recording.json: B4's JudgeVerdict per case id, and how they were recorded. */
export interface Recording {
  _about:string;
  /** 'hand-written' in the build session; 'live' when `npm run eval:record` wrote them with the real judge. */
  recordedBy:'hand-written'|'live';
  model?:string;
  recordedAt?:string;
  verdicts:Record<string,JudgeVerdict>;
}
const RECORDED=recording as Recording;
export const RECORDED_BY=RECORDED.recordedBy;
export const RECORDING:Readonly<Record<string,JudgeVerdict>>=RECORDED.verdicts;

export type JudgeKind='recorded'|'always-agree';
export const JUDGES:readonly JudgeKind[]=['recorded','always-agree'];

/** The candidates as the judge sees them (B4's JudgeCandidate): SKU, description, pack and category, never prices. */
export function judgeCandidates(retrieval:Retrieval<CatalogRow>):JudgeCandidate[]{
  return retrieval.candidates.map(({item})=>({sku:item.sku,description:item.description,pack:packLabel(item),category:item.category}));
}

/** The judge's answer for a case, validated with B4's guard: a SKU that is not on the candidate list is none. */
export function judgeVerdict(c:EvalCase,retrieval:Retrieval<CatalogRow>,judge:JudgeKind):JudgeVerdict{
  const verdict:JudgeVerdict=judge==='always-agree'
    ?{sku:retrieval.top?.item.sku??null,reason:'always agrees with the scorer'}
    :RECORDING[c.id]??{sku:null,reason:'no recording'};
  return withinCandidates(verdict,judgeCandidates(retrieval));
}

export interface CaseResult {
  id:string;
  level:StrictnessLevel;
  judge:JudgeKind;
  outcome:'matched'|'no_match';
  /** The matched SKU, or null. */
  sku:string|null;
  reason:NoMatchReason|null;
  topSku:string|null;
  topScore:number;
  lead:number;
  /** Matched the expected product (any pricing tier of it), or no match where none is expected. */
  correct:boolean;
  /** Matched where it must not, or matched the wrong item. */
  falsePositive:boolean;
}

const GROUP_OF=new Map(CATALOG.map(row=>[row.sku,productGroup(row)]));

export function runCase(c:EvalCase,level:StrictnessLevel,judge:JudgeKind):CaseResult{
  const retrieval=retrieve(c.description,CATALOG,matchConfig(level));
  const decision=decide(retrieval,judgeVerdict(c,retrieval,judge));
  const sku=decision.outcome==='matched'?decision.item.sku:null;
  const expected=c.expect==='no_match'?null:GROUP_OF.get(c.expect.sku);
  const correct=sku===null?c.expect==='no_match':expected!==undefined&&expected!==null&&GROUP_OF.get(sku)===expected;
  return {
    id:c.id,level,judge,outcome:decision.outcome,sku,reason:decision.outcome==='no_match'?decision.reason:null,
    topSku:retrieval.top?.item.sku??null,topScore:retrieval.top?.score??0,lead:retrieval.lead,
    correct,falsePositive:sku!==null&&!correct,
  };
}

export interface Metrics {
  cases:number;
  matched:number;
  /** Correct matches over all matches (1 when nothing matched). */
  precision:number;
  falsePositives:string[];
  /** Must-match lines matched to the right item, over all must-match lines. */
  recall:number;
  /** No-match outcomes over all lines. */
  noMatchRate:number;
}

const RUNS=new Map<string,ReturnType<typeof evaluate>>();
/** Every case at one level with one judge (memoized for the default case set: the run is deterministic). */
export function runEval(level:StrictnessLevel,judge:JudgeKind,cases:readonly EvalCase[]=CASES){
  if(cases!==CASES)return evaluate(level,judge,cases);
  const key=`${level}/${judge}`;
  if(!RUNS.has(key))RUNS.set(key,evaluate(level,judge,cases));
  return RUNS.get(key)!;
}

function evaluate(level:StrictnessLevel,judge:JudgeKind,cases:readonly EvalCase[]){
  const results=cases.map(c=>runCase(c,level,judge));
  const matched=results.filter(r=>r.outcome==='matched');
  const mustMatch=cases.filter(c=>c.expect!=='no_match').map(c=>c.id);
  const metrics:Metrics={
    cases:results.length,
    matched:matched.length,
    precision:matched.length?matched.filter(r=>r.correct).length/matched.length:1,
    falsePositives:results.filter(r=>r.falsePositive).map(r=>`${r.id} -> ${r.sku}`),
    recall:mustMatch.length?results.filter(r=>mustMatch.includes(r.id)&&r.outcome==='matched'&&r.correct).length/mustMatch.length:1,
    noMatchRate:results.filter(r=>r.outcome==='no_match').length/results.length,
  };
  return {results,metrics};
}

/** Every level with every judge: what `npm run eval:report` prints. */
export function report(){
  return STRICTNESS_LEVELS.flatMap(level=>JUDGES.map(judge=>({level,rule:matchConfig(level),label:LEVELS[level].label,judge,...runEval(level,judge)})));
}
