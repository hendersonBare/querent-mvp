// SKU matching (spec §3, task 1.4): does a plain-language line map to exactly one SKU? This barrel
// is pure and client-safe; the catalog and the customer's order history are passed in (the
// search_items chat tool reads them from the customer-safe repository).
import {clarifyingQuestion} from './question';
import {CONTENDER_MARGIN,isConfident,scoreItems,type Purchase,type ScoredItem} from './score';
import type {MatchableItem} from './text';

export {NO_MATCH_QUESTION,clarifyingQuestion} from './question';
export {CONFIDENCE,CONTENDER_MARGIN,HISTORY,OFF_NOUN,WEIGHTS,isConfident,scoreItems,type ConfidenceRule,type Purchase,type ScoredItem} from './score';
export {normalize,parseItem,parseQuery,saysUsual,type MatchableItem} from './text';
export {resolveUsual,type UsualItem} from './usual';

/** Candidates below this are left off a shortlist, unless they are within the contender margin of the best. */
export const SHORTLIST_FLOOR=0.5;

/** The candidates worth showing (as buttons, or to Claude): up to `limit`, dropping the weak tail. */
export function shortlist<T>(candidates:readonly ScoredItem<T>[],limit=5){
  const floor=Math.min(SHORTLIST_FLOOR,(candidates[0]?.score??0)-CONTENDER_MARGIN);
  return candidates.filter(c=>c.score>=floor).slice(0,Math.max(1,Math.floor(limit)));
}

export interface LineMatch<T> {
  /** The shortlist, best first. When `confident`, the first one is the match. */
  candidates:ScoredItem<T>[];
  confident:boolean;
  /** What to ask the customer when not confident; null when confident. */
  question:string|null;
}

/** Scores one line of a request against the catalog and decides: a confident match, or the question to ask. */
export function matchLine<T extends MatchableItem>(line:string,catalog:readonly T[],{purchases=[],limit=5}:{purchases?:readonly Purchase[];limit?:number}={}):LineMatch<T>{
  const scored=scoreItems(line,catalog,{purchases});
  const confident=isConfident(scored);
  return {candidates:shortlist(scored,limit),confident,question:confident?null:clarifyingQuestion(scored)};
}

// BOXT packaging matching (task B3): description-only scoring, retrieval with product groups, and the
// decision rule the quote tool's pipeline and the evaluation suite share.
export {BURST_TO_ECT,CONFLICT,PACKAGING_WEIGHTS,UNSTATED,scorePackaging,type Candidate} from './score-packaging';
export {itemPack,parseItemSpec,parseSpec,productGroup,type ItemSpec,type Pack,type PackagingItem,type Spec} from './packaging';
export {retrieve,type MatchRule,type RetrieveOptions,type Retrieval} from './retrieve';
export {decide,type Decision,type NoMatchReason,type Verdict} from './decide';
