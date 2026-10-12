// When a bell notification happened (plan U10; C_CVL4: "Just now", "2 h ago", "Yesterday"), and the
// Orders sheet's dates (C_CVL2: "Sep 25, 2026"). Days are UTC, like every date in the app. Pure, so
// each case is tested without rendering.

const MINUTE=60_000,HOUR=60*MINUTE,DAY=24*HOUR;
const dayMonth=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const dayMonthYear=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const utcDay=(iso:string)=>iso.slice(0,10);
const dayBefore=(iso:string)=>new Date(Date.parse(`${utcDay(iso)}T00:00:00.000Z`)-DAY).toISOString().slice(0,10);
/** "Sep 18", or "Dec 30, 2025" outside `now`'s year. */
const day=(iso:string,now:string)=>(utcDay(iso).slice(0,4)===utcDay(now).slice(0,4)?dayMonth:dayMonthYear).format(new Date(iso));

/**
 * "Just now" (under a minute), "5 min ago", "2 h ago" (under a day), "Yesterday", then the day. A
 * day-only time (an order's ship date) reads "Today", "Yesterday" or the day.
 */
export function timeAgo(at:string,now:string,{dayOnly=false}:{dayOnly?:boolean}={}){
  if(dayOnly){
    if(utcDay(at)===utcDay(now))return 'Today';
    if(utcDay(at)===dayBefore(now))return 'Yesterday';
    return day(at,now);
  }
  const ago=Date.parse(now)-Date.parse(at);
  if(ago<MINUTE)return 'Just now';
  if(ago<HOUR)return `${Math.floor(ago/MINUTE)} min ago`;
  if(ago<DAY)return `${Math.floor(ago/HOUR)} h ago`;
  if(utcDay(at)===dayBefore(now))return 'Yesterday';
  return day(at,now);
}

/** An order's date with its year: "Sep 9, 2026". */
export const orderDate=(ymd:string)=>dayMonthYear.format(new Date(`${ymd}T00:00:00.000Z`));
