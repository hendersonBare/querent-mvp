// Match strictness (BOXT): the single config module the quote tool's matcher reads. A level is the
// rule the scorer must clear before the judge is even asked: the top candidate's score (minScore)
// and its lead over the best candidate of another product group (minLead). Calibrated by the
// evaluation suite (src/eval, `npm run eval:report`; the table is in src/eval/README.md): Strict
// admits no false positive there even with a judge that always agrees. Pure and client-safe.

export type StrictnessLevel='strict'|'balanced'|'lenient';
export const STRICTNESS_LEVELS:readonly StrictnessLevel[]=['strict','balanced','lenient'];

export interface StrictnessConfig {label:string;description:string;minScore:number;minLead:number}

export const LEVELS:Readonly<Record<StrictnessLevel,StrictnessConfig>>={
  strict:{label:'Strict',description:'Matches only lines that confirm every detail they state, so a wrong item is very unlikely and more lines are left for you to match.',minScore:0.9,minLead:0.3},
  balanced:{label:'Balanced',description:'Also matches lines that leave a detail of the item unconfirmed, so fewer lines are left over but you should check matches more closely.',minScore:0.8,minLead:0.2},
  lenient:{label:'Lenient',description:'Matches whenever one item is clearly the best fit, which leaves the fewest lines over and needs the closest review.',minScore:0.7,minLead:0.15},
};

export const DEFAULT_LEVEL:StrictnessLevel='strict';

export const isStrictnessLevel=(value:unknown):value is StrictnessLevel=>typeof value==='string'&&(STRICTNESS_LEVELS as readonly string[]).includes(value);

/** The rule retrieve() takes for a level; an unknown level gets the default. */
export function matchConfig(level:StrictnessLevel){
  const {minScore,minLead}=LEVELS[isStrictnessLevel(level)?level:DEFAULT_LEVEL];
  return {minScore,minLead};
}
