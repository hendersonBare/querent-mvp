import type {Retrieval} from './retrieve';
import {hundredths} from './score';

// Decide (BOXT pipeline step 4): Matched only when the scorer clears the threshold and lead AND the
// judge picks an item of the top candidate's product group (it may pick the other pricing tier; that
// is the item matched). Never on the judge alone, never on the scorer alone. The quote tool's pipeline
// and the evaluation suite (src/eval) both call this, so they cannot disagree. Pure.

export type NoMatchReason='below_threshold'|'low_lead'|'judge_none'|'judge_disagrees'|'no_candidates';
export type Decision<T>={outcome:'matched';item:T;score:number}|{outcome:'no_match';reason:NoMatchReason};
/** The judge's answer: a SKU from the candidate list, or null for none. */
export interface Verdict {sku:string|null}

export function decide<T extends {sku:string}>(retrieval:Retrieval<T>,verdict:Verdict):Decision<T>{
  const {top}=retrieval;
  if(!top)return {outcome:'no_match',reason:'no_candidates'};
  if(!retrieval.clears){
    const low=hundredths(top.score)<hundredths(retrieval.rule.minScore);
    return {outcome:'no_match',reason:low?'below_threshold':'low_lead'};
  }
  if(verdict.sku===null)return {outcome:'no_match',reason:'judge_none'};
  const pick=retrieval.candidates.find(c=>c.item.sku===verdict.sku&&c.group===top.group);
  return pick?{outcome:'matched',item:pick.item,score:pick.score}:{outcome:'no_match',reason:'judge_disagrees'};
}
