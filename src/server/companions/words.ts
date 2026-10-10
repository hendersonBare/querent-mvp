import {itemName} from './fasteners';

// Catalog noun phrases for the companion wording (the rep chips' templates, src/server/upsells/wording,
// and the customer pop-up's suggestion reasons, src/server/customer/suggestions). Pure.

/** "Hex cap screw" -> "hex cap screw"; a leading acronym or code ("N95 ...") keeps its case. */
export function lowerFirst(text:string){return /^[A-Z][a-z]/.test(text)?text[0].toLowerCase()+text.slice(1):text;}

/** Plural of a catalog noun phrase: "cut-off wheel" -> "cut-off wheels", "box" -> "boxes"; "gloves" stays. */
export function pluralize(noun:string){
  if(/s$/i.test(noun))return noun;
  if(/[^aeiou]y$/i.test(noun))return `${noun.slice(0,-1)}ies`;
  if(/fe$/i.test(noun))return `${noun.slice(0,-2)}ves`;
  if(/(sh|ch|x|z)$/i.test(noun))return `${noun}es`;
  return `${noun}s`;
}

/** The plural short name of an item: "Cut-off wheel 4.5 x .045 ..." -> "cut-off wheels". */
export const itemNoun=(description:string)=>pluralize(lowerFirst(itemName(description)));
