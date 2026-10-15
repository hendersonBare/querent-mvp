import type {JudgeCandidate,JudgeVerdict} from './types';

// Verdict reasons the code itself writes (the judge's own reasons are free text), and the one
// guard every judge path shares: a verdict may only name a SKU from that line's candidates.

/** The call failed, timed out, refused or answered malformed: No match. */
export const JUDGE_ERROR='judge_error';
/** The judge named a SKU that was not offered: No match. */
export const NOT_IN_CANDIDATES='not_in_candidates';
/** There was nothing to choose from. */
export const NO_CANDIDATES='no_candidates';

/** The distinct candidate SKUs, in order. */
export function candidateSkus(candidates:JudgeCandidate[]):string[]{
  return [...new Set(candidates.map(c=>c.sku))];
}

/** The verdict, or null with NOT_IN_CANDIDATES when it names a SKU outside the list. */
export function withinCandidates(verdict:JudgeVerdict,candidates:JudgeCandidate[]):JudgeVerdict{
  if(verdict.sku===null||candidates.some(c=>c.sku===verdict.sku))return verdict;
  return {sku:null,reason:NOT_IN_CANDIDATES};
}
