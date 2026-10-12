import {formatMargin} from '@/server/floors';

// Pure helpers for Settings (task 6.1): the floor field's text and the floor marker's position. No React,
// so they are unit-tested alone. (Rep assignments and its sentences moved to Teams and Reps, plan U7.)

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
