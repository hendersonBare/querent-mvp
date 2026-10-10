import {formatMargin} from '@/server/floors';
import type {AssignmentRow} from '@/server/rep/settings';

// Pure helpers for Settings (task 6.1): the floor field's text, the floor marker's position, and
// the sentences that say what a reassignment changed. No React, so they are unit-tested alone.

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

const count=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`;

/** "25 with Brandi Gallegos", "25 with Brandi Gallegos, 1 with Mara Jensen", or "None yet". */
export function quotesByRep(quotes:AssignmentRow['quotes']){
  return quotes.length?quotes.map(q=>`${q.count} with ${q.rep_name}`).join(', '):'None yet';
}

/**
 * What a reassignment did, for the notice under the table: "Wasatch Mechanical Contractors is now
 * Mara Jensen’s customer. Its 25 existing quotes stay with Brandi Gallegos." With "Also move this
 * customer’s open quotes" (task D2), `moved` says how many went along: "4 open quotes moved to Mara Jensen."
 */
export function reassignedNote(row:AssignmentRow,moved:number|null=null){
  const others=row.quotes.filter(q=>q.rep_id!==row.rep_id);
  const kept=others.reduce((n,q)=>n+q.count,0);
  const went=moved===null?'':moved?` ${count(moved,'open quote')} moved to ${row.rep_name??'that rep'}.`:' No open quotes to move.';
  const stay=kept?` Its ${count(kept,'existing quote')} ${kept===1?'stays':'stay'} with ${others.map(q=>q.rep_name).join(' and ')}.`:'';
  return `${row.name} is now ${row.rep_name??'another rep'}’s customer. New quote requests go to ${row.rep_name??'that rep'}.${went}${stay}`;
}
