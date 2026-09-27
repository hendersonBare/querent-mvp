// Words and formats for the rep's quote detail (task 3.3). Pure, so the server render and the
// browser print the same text (no hydration drift): every date names its time zone.

const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
/** "$1,122.40", or "—" with no amount. */
export const money=(amount:number|null|undefined)=>amount==null?'—':usd.format(amount);
/** "+$4.50" / "−$4.00" (a true minus sign), "$0.00". */
export const signedMoney=(amount:number)=>amount>0?`+${usd.format(amount)}`:amount<0?`−${usd.format(-amount)}`:usd.format(0);
/** A unit price in an input: "31.50", or "" while unpriced. */
export const priceInput=(price:number|null)=>price===null?'':price.toFixed(2);

/**
 * Herrick's branches are in Utah, so times of day read in Mountain time (the seeded request at
 * 16:14Z is the mockup's "10:14 AM"). Days alone (valid until, last paid) are UTC, like every
 * other date in the app.
 */
export const BRANCH_TIME_ZONE='America/Denver';

const requestParts=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:BRANCH_TIME_ZONE});
/** "Wed Sep 23, 10:14 AM" (Mountain time). */
export function requestedAt(iso:string){
  const part=(type:Intl.DateTimeFormatPartTypes)=>requestParts.formatToParts(new Date(iso)).find(p=>p.type===type)?.value??'';
  return `${part('weekday')} ${part('month')} ${part('day')}, ${part('hour')}:${part('minute')} ${part('dayPeriod')}`;
}

const dayMonth=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const dayMonthYear=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
/** A day (YYYY-MM-DD or ISO): "Oct 7", or "Oct 7, 2027" outside `now`'s year. */
export function day(value:string,now:string){
  const date=new Date(value.length===10?`${value}T00:00:00.000Z`:value);
  return (date.getUTCFullYear()===new Date(now).getUTCFullYear()?dayMonth:dayMonthYear).format(date);
}

const clockTime=new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:BRANCH_TIME_ZONE});
/** "10:14 AM" (Mountain time), for "Saved 10:14 AM". */
export const timeOfDay=(iso:string)=>clockTime.format(new Date(iso));

/** "4 items", "1 item". */
export const itemCount=(n:number)=>`${n} ${n===1?'item':'items'}`;
