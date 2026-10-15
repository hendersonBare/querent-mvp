// Match strictness (BOXT): the single config module the quote tool's matcher reads. A level is the
// rule the scorer must clear before the judge is even asked: the top candidate's score (minScore)
// and its lead over the best candidate of another product group (minLead). Calibrated by the
// evaluation suite (src/eval, `npm run eval:report`; the table is in src/eval/README.md): Strict
// admits no false positive there even with a judge that always agrees. Pure and client-safe.

export type StrictnessLevel='strict'|'balanced'|'lenient';
export const STRICTNESS_LEVELS:readonly StrictnessLevel[]=['strict','balanced','lenient'];

export interface StrictnessConfig {label:string;description:string;minScore:number;minLead:number}

export const LEVELS:Readonly<Record<StrictnessLevel,StrictnessConfig>>={
  // Scores are products of factors (src/server/matching/score-packaging.ts): 1 when the item accounts
  // for everything, 0.75 with one thing unconfirmed on either side, 0.56 with two, at most 0.5 with a
  // contradiction. A rival that differs only by one unconfirmed thing sits 0.25 behind.
  // Strict: no unconfirmed thing (0.90 is 0.15 above the best false line, 0.10 below a full match),
  // and a lead of 0.35 (0.10 above the 0.25 of a one-detail rival, case n42; the weakest true
  // match in the evaluation leads by 0.44). Zero false positives there with both judges.
  strict:{label:'Strict',description:'Matches a line only when one item accounts for everything it states and no other item comes close, which is the safest setting and leaves the most lines for you to match.',minScore:0.9,minLead:0.35},
  // Balanced: one unconfirmed detail, and a rival that differs by one detail; relies on the judge for those.
  balanced:{label:'Balanced',description:'Also matches when one detail is unconfirmed, such as a word the catalog does not use or a feature the line does not mention, so check those matches before you save.',minScore:0.7,minLead:0.2},
  // Lenient: up to two unconfirmed details.
  lenient:{label:'Lenient',description:'Matches when one item is clearly the best fit even with two details unconfirmed, which leaves the fewest lines over but needs the closest review.',minScore:0.55,minLead:0.15},
};

export const DEFAULT_LEVEL:StrictnessLevel='strict';

export const isStrictnessLevel=(value:unknown):value is StrictnessLevel=>typeof value==='string'&&(STRICTNESS_LEVELS as readonly string[]).includes(value);

/** The rule retrieve() takes for a level; an unknown level gets the default. */
export function matchConfig(level:StrictnessLevel){
  const {minScore,minLead}=LEVELS[isStrictnessLevel(level)?level:DEFAULT_LEVEL];
  return {minScore,minLead};
}
