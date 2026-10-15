import {parseSpec,type PackagingItem} from './packaging';
import {hundredths,scorePackaging,type Candidate,type Eligibility} from './score-packaging';

// Retrieve (BOXT pipeline step 2): the candidates for one parsed line, and whether the scorer alone
// clears the threshold. The judge then sees `candidates`; decide() (decide.ts) makes the call.

export type {Candidate,Eligibility} from './score-packaging';

/** The strictness level's rule (src/features/settings/strictness.ts). */
export interface MatchRule {
  minScore:number;
  minLead:number;
  /**
   * Total accounting (Strict): the top candidate must be Strict-eligible, i.e. every token of the
   * line is read by one recognised field and the item confirms each (see score-packaging.ts).
   * Absent or false: the score and lead alone decide (Balanced, Lenient).
   */
  requireTotalAccounting?:boolean;
}
export interface RetrieveOptions extends MatchRule {candidateLimit?:number;nearMissLimit?:number}

export interface Retrieval<T> {
  /** Best first, at most candidateLimit (default 8). Pricing tiers of one item both appear. */
  candidates:Candidate<T>[];
  top:Candidate<T>|null;
  /** The top score minus the best score of a DIFFERENT product group (the whole top score when there is none). */
  lead:number;
  /** The line names a product type (boxes, bags, mailers, ...) that the top candidate confirms. */
  namesProduct:boolean;
  /**
   * Whether the line is Strict-eligible against the top candidate, and if not, why (for the rep:
   * "Could not detect a match: the line says "or""). With no candidate, the line's own blockers.
   */
  eligibility:Eligibility;
  /** namesProduct, top.score >= minScore and lead >= minLead (compared in hundredths), and, when the rule requires total accounting, eligibility.strictEligible. */
  clears:boolean;
  /** The best of each product group, at most nearMissLimit (default 5): what a No-match line offers the rep. */
  nearMisses:Candidate<T>[];
  /** The rule this retrieval was measured against. */
  rule:MatchRule;
}

export function retrieve<T extends PackagingItem>(description:string,catalog:readonly T[],{minScore,minLead,requireTotalAccounting=false,candidateLimit=8,nearMissLimit=5}:RetrieveOptions):Retrieval<T>{
  const rule={minScore,minLead,requireTotalAccounting};
  const scored=scorePackaging(description,catalog);
  const top=scored[0]??null;
  if(!top){
    const eligibility={strictEligible:false,blockers:[...parseSpec(description).blockers,'no catalog item fits the line']};
    return {candidates:[],top:null,lead:0,namesProduct:false,eligibility,clears:false,nearMisses:[],rule};
  }
  const rival=scored.find(c=>c.group!==top.group);
  const lead=(hundredths(top.score)-hundredths(rival?.score??0))/100;
  // A bare size ("19x24") or bare numbers can fit an item perfectly by coincidence: never a match.
  const namesProduct=top.typeConfirmed;
  const {eligibility}=top;
  const clears=namesProduct&&(!requireTotalAccounting||eligibility.strictEligible)&&hundredths(top.score)>=hundredths(minScore)&&hundredths(lead)>=hundredths(minLead);
  const nearMisses:Candidate<T>[]=[];
  const seen=new Set<string>();
  for(const c of scored){
    if(nearMisses.length>=nearMissLimit)break;
    if(seen.has(c.group))continue;
    seen.add(c.group);
    nearMisses.push(c);
  }
  return {candidates:scored.slice(0,Math.max(1,Math.floor(candidateLimit))),top,lead,namesProduct,eligibility,clears,nearMisses,rule};
}
