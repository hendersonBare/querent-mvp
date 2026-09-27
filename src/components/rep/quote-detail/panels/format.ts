import {BRANCH_TIME_ZONE} from '../format';

// Words and formats for the side panels (task 3.4). Pure, with explicit time zones, so the server
// render and the browser print the same text.

const parts=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:BRANCH_TIME_ZONE});
/** When something happened, in Mountain time like the rest of the page: "Sep 23, 10:14 AM" ("Sep 23, 2025, 10:14 AM" in another year). */
export function stamp(iso:string,now:string){
  const part=(date:Date,type:Intl.DateTimeFormatPartTypes)=>parts.formatToParts(date).find(p=>p.type===type)?.value??'';
  const date=new Date(iso),year=part(date,'year');
  return `${part(date,'month')} ${part(date,'day')}${year===part(new Date(now),'year')?'':`, ${year}`}, ${part(date,'hour')}:${part(date,'minute')} ${part(date,'dayPeriod')}`;
}

const weekdayDay=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
/** A day (YYYY-MM-DD) with its weekday: "Thu, Sep 24" becomes "Thu Sep 24", as in the mockup. */
export const dayWithWeekday=(day:string)=>weekdayDay.format(new Date(`${day}T00:00:00.000Z`)).replace(',','');

/** "1 note", "3 events". */
export const count=(n:number,noun:string)=>`${n} ${noun}${n===1?'':'s'}`;

/** A fraction as a whole percent: "71%". */
export const wholePercent=(fraction:number)=>`${Math.round(fraction*100)}%`;

export const firstName=(name:string)=>name.trim().split(/\s+/)[0];
