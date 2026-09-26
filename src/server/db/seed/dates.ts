// Every seeded date is an offset from the anchor: the day Dana sent the Q-24817 request.
// QUERENT_SEED_DATE=2026-09-23 reproduces the mockup's dates exactly (last paid Aug 12,
// last order Sep 9, contract through Dec 31, 2026). Without it the anchor is yesterday
// (UTC), so the demo stays current after every `npm run db:reset`.

const DAY=/^\d{4}-\d{2}-\d{2}$/;
const parse=(day:string)=>new Date(`${day}T00:00:00.000Z`);

export function addDays(day:string,days:number){const d=parse(day);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
/** ISO timestamp for `time` (HH:MM, UTC) on the day `days` from `day`. */
export function at(day:string,days:number,time:string){return `${addDays(day,days)}T${time}:00.000Z`;}
export function addMinutes(iso:string,minutes:number){return new Date(Date.parse(iso)+minutes*60_000).toISOString();}
/** The first `weekday` (0 = Sunday) strictly after `day`. */
export function nextWeekday(day:string,weekday:number){return addDays(day,(weekday-parse(day).getUTCDay()+7)%7||7);}
/** "Aug 12" */
export function shortDate(day:string){return parse(day).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});}
/** "Dec 31, 2026" */
export function longDate(day:string){return parse(day).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});}

export function defaultSeedAnchor(now=new Date()){return addDays(now.toISOString().slice(0,10),-1);}
export function seedAnchorFromEnv(env:Record<string,string|undefined>=process.env,now=new Date()){
  const value=env.QUERENT_SEED_DATE?.trim();
  if(!value)return defaultSeedAnchor(now);
  if(!DAY.test(value)||Number.isNaN(parse(value).getTime())||addDays(value,0)!==value)throw new Error(`QUERENT_SEED_DATE must be a date like 2026-09-23 (got "${value}").`);
  return value;
}
