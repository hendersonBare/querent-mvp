// Activity-log rules, client-safe and pure (docs/boxt/plan.md "Database", product rule 8).
//
// The activity log records who did what and when, with metadata made of counts, scores, thresholds,
// flags and a few known enum values. It never holds customer text: no customer names, references,
// line text, SKUs typed by a customer, file names or emails. The rule, applied by
// sanitizeActivityMetadata before every insert:
//   - only a flat object, at most MAX_METADATA_KEYS keys;
//   - keys are short identifiers (/^[a-z][A-Za-z0-9_]{0,39}$/), since a key can carry text too;
//   - values are finite numbers, booleans, null, or a string from METADATA_ENUMS;
//   - anything else (free text, arrays, nested objects, dates, NaN) is dropped silently.
// The database repeats a looser form of the rule as a check constraint on activity_log.metadata.
// Add a value to METADATA_ENUMS only if it is a fixed word the app chooses, never something a user typed.

export const ACTIVITY_ACTIONS=['login','logout','match_run','quote_create','quote_update','quote_delete','settings_change'] as const;
export type ActivityAction=typeof ACTIVITY_ACTIONS[number];
export const isActivityAction=(value:unknown):value is ActivityAction=>ACTIVITY_ACTIONS.includes(value as ActivityAction);

/** The only strings metadata may hold. */
export const METADATA_ENUMS=[
  // match strictness levels
  'strict','balanced','lenient',
  // input kinds
  'text','pdf',
  // who matched a line
  'auto','rep',
  // outcomes
  'matched','unmatched','success','failure','timeout',
  // sign-in methods (B2 logs login with {method:'password'})
  'password',
] as const;
export type MetadataEnum=typeof METADATA_ENUMS[number];

export const MAX_METADATA_KEYS=24;
const KEY=/^[a-z][A-Za-z0-9_]{0,39}$/;

export type ActivityMetadata=Record<string,number|boolean|MetadataEnum|null>;

const isEnum=(value:string):value is MetadataEnum=>(METADATA_ENUMS as readonly string[]).includes(value);

/** Keeps only what the rule above allows. */
export function sanitizeActivityMetadata(input:Readonly<Record<string,unknown>>|null|undefined):ActivityMetadata{
  const out:ActivityMetadata={};
  if(!input||typeof input!=='object'||Array.isArray(input))return out;
  let kept=0;
  for(const [key,value] of Object.entries(input)){
    if(kept>=MAX_METADATA_KEYS)break;
    if(!KEY.test(key))continue;
    if((typeof value==='number'&&Number.isFinite(value))||typeof value==='boolean'||value===null||(typeof value==='string'&&isEnum(value))){
      out[key]=value;
      kept++;
    }
  }
  return out;
}
