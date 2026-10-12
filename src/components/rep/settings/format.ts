import type {Category} from '@/lib/contracts';
import {formatMargin} from '@/server/floors';

// Pure helpers for Settings (task 6.1; plan U8): the floor field's text and the floor marker's position,
// and the frames' words for Customer access, Aging and Pricing and delivery. No React, so they are
// unit-tested alone. (Rep assignments and its sentences moved to Teams and Reps, plan U7.)

/** The floor field's text: 0.3 -> "30.0", at the 0.1-point precision the warnings compare at (formatMargin). */
export const floorInput=(fraction:number)=>formatMargin(fraction).replace('%','');

/** The highest floor Settings accepts, in percent. The server checks the same range. */
export const MAX_FLOOR_PCT=99.9;

/**
 * What the rep typed in a floor field, as a percent (30.5), or null when it isn't a number from 0
 * to 99.9. Rounded to tenths, as the server stores it.
 */
export function parseFloorPct(text:string):number|null{
  const trimmed=text.trim().replace(/%$/,'').trim();
  if(!trimmed||!/^\d*\.?\d*$/.test(trimmed))return null;
  const tenths=Math.round(Number((Number(trimmed)*10).toPrecision(12)));
  return Number.isFinite(tenths)&&tenths>=0&&tenths<=MAX_FLOOR_PCT*10?tenths/10:null;
}

/** The floor marker's scale: 0% to 50%, the margin bar's range on the quote (mockup .fbar). */
export const FLOOR_SCALE_MAX=0.5;
/** Where the floor marker sits on the track, as a CSS percentage (clamped to the track). */
export const floorPosition=(fraction:number)=>`${Math.round(Math.min(1,Math.max(0,fraction/FLOOR_SCALE_MAX))*1000)/10}%`;

// ---- Customer access (C_S1, C_S1a, C_S1b)

/** The data types in the frames' order and words ("Items and stock", not the chat's "Items & stock"). */
export const ACCESS_TYPES:readonly {category:Category;label:string}[]=[
  {category:'items_stock',label:'Items and stock'},{category:'pricing',label:'Pricing'},
  {category:'orders_quotes',label:'Orders and quotes'},{category:'account',label:'Account'},
];

/** A switch's state: on, off, or (no filter, C_S1) on for some customers and off for others. */
export const accessState=(enabled:boolean|null)=>enabled===null?'On for some customers':enabled?'Querent answers':'Not shared';

/** One filter state per data type (C_S1a): Any, Querent answers, Not shared. */
export type AccessChoice='any'|'answers'|'not_shared';
export type AccessFilterValue=Record<Category,AccessChoice>;
export const NO_ACCESS_FILTER:AccessFilterValue={items_stock:'any',pricing:'any',orders_quotes:'any',account:'any'};
export const ACCESS_CHOICES:readonly {value:AccessChoice;label:string}[]=[{value:'any',label:'Any'},{value:'answers',label:'Querent answers'},{value:'not_shared',label:'Not shared'}];

/** The data types picked: the Filter badge (C_S1b "1"). */
export const filterCount=(filter:AccessFilterValue)=>ACCESS_TYPES.filter(t=>filter[t.category]!=='any').length;

/** GET /api/rep/settings/access's query: the search and every type not Any. */
export function accessQuery(q:string,filter:AccessFilterValue){
  const params=new URLSearchParams();
  if(q.trim())params.set('q',q.trim());
  for(const {category} of ACCESS_TYPES)if(filter[category]!=='any')params.set(category,filter[category]);
  return params.toString();
}

/** "2 of 6 customers" beside the Filter (C_S1b). */
export const matchCount=(shown:number,total:number)=>`${shown} of ${total} ${total===1?'customer':'customers'}`;

// ---- Aging (C_S8), Pricing and delivery (C_S4, C_S7), Rep margins (C_S2)

/** "3 days" beside a whole number of days (24 h and up), so 72 and 168 read as decision 16's 3 and 7 days. */
export function inDays(text:string){
  const hours=Number(text);
  return text.trim()&&Number.isInteger(hours)&&hours>=24&&hours%24===0?`${hours/24} ${hours===24?'day':'days'}`:'';
}

/** The frame's name for each aging status row (C_S8: "Draft ready", as the Quotes board names the lane). */
export const AGING_STATUS:Readonly<Record<'Ready for review'|'Changes requested'|'Sent',string>>={'Ready for review':'Draft ready','Changes requested':'Changes requested',Sent:'Sent'};

/** The freight engine's worked example with the frame's plain x (C_S4: "$25.00 + $2.50/mi x 15.0 mi = $62.50"). */
export const plainFormula=(formula:string)=>formula.replace(/×/g,'x');

/** An average line price change in cents as C_S7 prints it: "+$0.12". */
export const plusDollars=(cents:number)=>`+$${(Math.max(0,cents)/100).toFixed(2)}`;

/** "Eli" from "Eli Porter" (C_S2's column heading). */
export const firstName=(name:string)=>name.trim().split(/\s+/)[0]||name;
