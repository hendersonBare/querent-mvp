// Match strictness (BOXT): the single config module the quote tool's matcher reads. A level is the
// rule the scorer must clear before the judge is even asked: the top candidate's score (minScore)
// and its lead over the best candidate of another product group (minLead). Calibrated by the
// evaluation suite (src/eval, `npm run eval:report`; the table is in src/eval/README.md): Strict
// admits no false positive there even with a judge that always agrees. Pure and client-safe.

export type StrictnessLevel='strict'|'balanced'|'lenient';
export const STRICTNESS_LEVELS:readonly StrictnessLevel[]=['strict','balanced','lenient'];

export interface StrictnessConfig {label:string;description:string;minScore:number;minLead:number}

export const LEVELS:Readonly<Record<StrictnessLevel,StrictnessConfig>>={
  // Zero false positives in the evaluation with both judges. Safe there for minScore in (0.80, 0.87]
  // and minLead in (0.20, 0.30]: an item with one unconfirmed defining feature scores 0.80, so 0.80
  // would match plain "poly bags" to reclosable ones (case n46); minLead 0.20 would pick poly over
  // kraft for "bubble mailers #2" (case n42). Both bounds are taken with margin.
  strict:{label:'Strict',description:'Matches a line only when one item confirms everything it states and no other item comes close, which is the safest setting and leaves the most lines for you to match.',minScore:0.85,minLead:0.3},
  // Admits a best item with one defining feature the line doesn't mention (it scores 0.80) when it
  // leads by 0.20; relies on the judge for those (see src/eval/README.md).
  balanced:{label:'Balanced',description:'Also matches when the best item has one feature the line does not mention, such as a zip closure or a white finish, so check those matches before you save.',minScore:0.8,minLead:0.2},
  lenient:{label:'Lenient',description:'Matches whenever one item is clearly the best fit even if the line leaves details open, which leaves the fewest lines over but needs the closest review.',minScore:0.7,minLead:0.15},
};

export const DEFAULT_LEVEL:StrictnessLevel='strict';

export const isStrictnessLevel=(value:unknown):value is StrictnessLevel=>typeof value==='string'&&(STRICTNESS_LEVELS as readonly string[]).includes(value);

/** The rule retrieve() takes for a level; an unknown level gets the default. */
export function matchConfig(level:StrictnessLevel){
  const {minScore,minLead}=LEVELS[isStrictnessLevel(level)?level:DEFAULT_LEVEL];
  return {minScore,minLead};
}
