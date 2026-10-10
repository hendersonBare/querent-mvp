import type {DeclineReason,Fulfillment} from '@/domain';
import {sanitizeChatText} from './announce';

// What the customer sends with Accept, Request changes (spec §3, task 5.2) and Decline (v3 §2.1). Pure and
// client-safe: the preview modal's forms and the customer response service use the same rules, so
// the form offers only what the server takes.
//
// Accept asks for a pickup or delivery time and a PO. The spec leaves the time rules open; these
// are the demo's defaults (flagged in task 5.2), all in this block:
//   - a day and a half-hour slot, in the branches' time zone (Mountain);
//   - weekdays only, 7:00 AM to 4:00 PM: inside every branch's will-call hours (SLC 6:30 to 5:00,
//     Ogden and Provo 7:00 to 4:30), the last slot half an hour before the earliest close;
//   - at least an hour from now (never in the past), and at most 60 days out.
// The same rules hold for pickup and delivery. The time is stored as an ISO instant (UTC), like
// every other timestamp, and shown in Mountain time.

export const BRANCH_TIME_ZONE='America/Denver';
const FIRST_SLOT_MINUTES=7*60,LAST_SLOT_MINUTES=16*60,SLOT_MINUTES=30;
/** How far ahead the chosen time must be. */
export const LEAD_MINUTES=60;
/** The furthest day ahead that can be chosen. */
export const MAX_DAYS_AHEAD=60;
/** The PO's length once cleaned, as the rep's Quote terms panel allows. */
export const PO_MAX=40;
/** The change request note's length once cleaned. */
export const NOTE_MAX=1000;

const pad=(n:number)=>String(n).padStart(2,'0');
/** "07:00" to "16:00", every half hour. */
export const TIME_SLOTS:readonly string[]=Array.from({length:(LAST_SLOT_MINUTES-FIRST_SLOT_MINUTES)/SLOT_MINUTES+1},
  (_,i)=>{const m=FIRST_SLOT_MINUTES+i*SLOT_MINUTES;return `${pad(Math.floor(m/60))}:${pad(m%60)}`;});

/** "10:00" as "10:00 AM". */
export function slotLabel(slot:string){
  const [h,m]=slot.split(':').map(Number);
  return `${h%12||12}:${pad(m)} ${h<12?'AM':'PM'}`;
}

const DAY=/^\d{4}-\d{2}-\d{2}$/;
const SLOT=/^\d{2}:\d{2}$/;
const DAY_MS=86_400_000;

/** A real calendar day like 2026-09-29 (not Feb 30). */
function isDay(day:string){
  if(!DAY.test(day))return false;
  const ms=Date.parse(`${day}T00:00:00.000Z`);
  return !Number.isNaN(ms)&&new Date(ms).toISOString().slice(0,10)===day;
}
const addDays=(day:string,days:number)=>new Date(Date.parse(`${day}T00:00:00.000Z`)+days*DAY_MS).toISOString().slice(0,10);
const isWeekday=(day:string)=>{const d=new Date(`${day}T12:00:00.000Z`).getUTCDay();return d!==0&&d!==6;};

const wallParts=new Intl.DateTimeFormat('en-US',{timeZone:BRANCH_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
/** The branch's wall clock at `ms`, as if it were UTC. */
function wallClock(ms:number){
  const p=Object.fromEntries(wallParts.formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
  return Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute));
}

/** Today in the branches' time zone (YYYY-MM-DD). */
export function branchDay(now:string){
  return new Date(wallClock(Date.parse(now))).toISOString().slice(0,10);
}

/** The instant (ISO, UTC) of `slot` on `day` in the branches' time zone. */
export function branchInstant(day:string,slot:string){
  const local=Date.parse(`${day}T${slot}:00.000Z`);
  // The zone's offset at a first guess, then again at the answer, in case the guess crossed a DST change.
  let ms=local-(wallClock(local)-local);
  ms=local-(wallClock(ms)-ms);
  return new Date(ms).toISOString();
}

/** The last day that can be chosen at `now`. */
export const latestDay=(now:string)=>addDays(branchDay(now),MAX_DAYS_AHEAD);

/** The slots that can be chosen on `day` at `now`: none on a weekend, a past day or a day too far out. */
export function slotsOn(day:string,now:string):string[]{
  if(!isDay(day)||!isWeekday(day)||day<branchDay(now)||day>latestDay(now))return [];
  const earliest=Date.parse(now)+LEAD_MINUTES*60_000;
  return TIME_SLOTS.filter(slot=>Date.parse(branchInstant(day,slot))>=earliest);
}

/** The first day with a slot left: the date field's minimum. */
export function earliestDay(now:string){
  let day=branchDay(now);
  for(let i=0;i<=MAX_DAYS_AHEAD&&!slotsOn(day,now).length;i++)day=addDays(day,1);
  return day;
}

const weekdayDay=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
const weekdayDayTime=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:BRANCH_TIME_ZONE});
/** "Thu Sep 24" for a day. */
const dayLabel=(day:string)=>weekdayDay.format(new Date(`${day}T00:00:00.000Z`)).replace(',','');

/** A stored pickup or delivery time in Mountain time: "Tue Sep 29, 10:00 AM"; a day on its own: "Thu Sep 24". */
export function fulfillmentTimeLabel(value:string){
  if(isDay(value))return dayLabel(value);
  const parts=weekdayDayTime.formatToParts(new Date(value));
  const part=(type:Intl.DateTimeFormatPartTypes)=>parts.find(p=>p.type===type)?.value??'';
  return `${part('weekday')} ${part('month')} ${part('day')}, ${part('hour')}:${part('minute')} ${part('dayPeriod')}`;
}

export interface FulfillmentTimeInput {
  /** YYYY-MM-DD, in the branches' time zone. */
  day:string;
  /** HH:MM, one of TIME_SLOTS. */
  time:string;
  /** Names the time in the messages: pickup or delivery. */
  fulfillment:Fulfillment;
  now:string;
}

/** The chosen time as the instant to store, or what's wrong with it in the customer's words. */
export function checkFulfillmentTime({day,time,fulfillment,now}:FulfillmentTimeInput):{at:string}|{problem:string}{
  const what=fulfillment==='delivery'?'delivery':'pickup';
  if(!isDay(day))return {problem:`Choose a ${what} day.`};
  if(!SLOT.test(time))return {problem:`Choose a ${what} time.`};
  // Off the grid ("10:15") or outside it ("18:00"): say what the grid is, 30-minute slots.
  if(!TIME_SLOTS.includes(time))return {problem:`${what==='delivery'?'Delivery':'Pickup'} times are every 30 minutes, on the hour or half hour, from ${slotLabel(TIME_SLOTS[0])} to ${slotLabel(TIME_SLOTS.at(-1)!)}. Choose one of those.`};
  if(day<branchDay(now))return {problem:`That day has passed. Choose ${dayLabel(earliestDay(now))} or later.`};
  if(day>latestDay(now))return {problem:`Choose a day within the next ${MAX_DAYS_AHEAD} days.`};
  if(!isWeekday(day))return {problem:`${what==='delivery'?'Delivery':'Pickup'} is Monday to Friday. Choose a weekday.`};
  const at=branchInstant(day,time);
  if(Date.parse(at)<Date.parse(now)+LEAD_MINUTES*60_000)return {problem:`Choose a ${what} time at least an hour from now.`};
  return {at};
}

/** The PO as stored: one line of plain text (line breaks and tabs become spaces). Anything that isn't a string is empty. */
export const cleanPo=(value:unknown)=>sanitizeChatText(typeof value==='string'?value.replace(/\s+/g,' '):value).replace(/\s+/g,' ');

/** What's wrong with a cleaned PO, or null. */
export function poProblem(po:string){
  if(!po.trim())return 'Enter your PO number.';
  if(po.length>PO_MAX)return `Keep the PO number to ${PO_MAX} characters.`;
  return null;
}

/** The change request note as stored: plain text with its line breaks (see sanitizeChatText). */
export const cleanNote=(value:unknown)=>sanitizeChatText(value);

/** What's wrong with a cleaned note, or null. */
export function noteProblem(note:string){
  if(!note.trim())return 'Say what should change: a note is required.';
  if(note.length>NOTE_MAX)return `Keep the note to ${NOTE_MAX.toLocaleString('en-US')} characters.`;
  return null;
}

// ---- Decline (v3 spec §2.1, decision 14) ----

/** The Other note's limit. */
export const DECLINE_NOTE_MAX=250;

/** Each reason as the customer's dialog, the rep's header and Activity word it. */
export const DECLINE_REASON_LABELS:Readonly<Record<DeclineReason,string>>={
  price_too_high:'Price too high',found_other_source:'Found other source',need_sooner:'Need it sooner than quoted',wrong_items:'Wrong items or quantity',other:'Other',
};

/** The Other note as stored: plain text, trimmed, control and invisible characters removed (OA-28; see sanitizeChatText). */
export const cleanDeclineNote=(value:unknown)=>sanitizeChatText(value);

/** What's wrong with a cleaned Other note, or null. It is optional. */
export const declineNoteProblem=(note:string)=>note.length>DECLINE_NOTE_MAX?`Keep the note to ${DECLINE_NOTE_MAX} characters.`:null;
