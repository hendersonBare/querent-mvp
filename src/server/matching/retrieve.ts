import type {PackagingItem} from './packaging';
import {hundredths} from './score';
import {scorePackaging,type Candidate} from './score-packaging';

// Retrieve (BOXT pipeline step 2): the candidates for one parsed line, and whether the scorer alone
// clears the threshold. The judge then sees `candidates`; decide() (decide.ts) makes the call.

export type {Candidate} from './score-packaging';

/** The strictness level's rule (src/features/settings/strictness.ts). */
export interface MatchRule {minScore:number;minLead:number}
export interface RetrieveOptions extends MatchRule {candidateLimit?:number;nearMissLimit?:number}

export interface Retrieval<T> {
  /** Best first, at most candidateLimit (default 8). Pricing tiers of one item both appear. */
  candidates:Candidate<T>[];
  top:Candidate<T>|null;
  /** The top score minus the best score of a DIFFERENT product group (the whole top score when there is none). */
  lead:number;
  /** top.score >= minScore and lead >= minLead, compared in hundredths. */
  clears:boolean;
  /** The best of each product group, at most nearMissLimit (default 5): what a No-match line offers the rep. */
  nearMisses:Candidate<T>[];
  /** The rule this retrieval was measured against. */
  rule:MatchRule;
}

export function retrieve<T extends PackagingItem>(description:string,catalog:readonly T[],{minScore,minLead,candidateLimit=8,nearMissLimit=5}:RetrieveOptions):Retrieval<T>{
  const rule={minScore,minLead};
  const scored=scorePackaging(description,catalog);
  const top=scored[0]??null;
  if(!top)return {candidates:[],top:null,lead:0,clears:false,nearMisses:[],rule};
  const rival=scored.find(c=>c.group!==top.group);
  const lead=(hundredths(top.score)-hundredths(rival?.score??0))/100;
  const clears=hundredths(top.score)>=hundredths(minScore)&&hundredths(lead)>=hundredths(minLead);
  const nearMisses:Candidate<T>[]=[];
  const seen=new Set<string>();
  for(const c of scored){
    if(nearMisses.length>=nearMissLimit)break;
    if(seen.has(c.group))continue;
    seen.add(c.group);
    nearMisses.push(c);
  }
  return {candidates:scored.slice(0,Math.max(1,Math.floor(candidateLimit))),top,lead,clears,nearMisses,rule};
}
