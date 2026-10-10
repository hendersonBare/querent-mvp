import type {MetricsRep} from './metrics';

// The Team dashboard's filters as GET /api/rep/team/metrics(.csv) reads them (v3 spec §5, §7;
// decisions 10, 23; OA-19; task D3). Pure. The browser computes the window at its own local
// midnights and sends two ISO instants; the server does no time-zone math, it only checks them.
//
//   from, to   ISO date-times with a time zone (Z or ±hh:mm), from < to, at most MAX_RANGE_DAYS apart
//   reps       comma-separated rep ids (any rep, inactive ones too: Team history, OA-27); none = every active rep
//   team       a team label in use; it narrows the reps to that team

/** The longest window the API serves: a year and a bit, so a 366-day custom range always fits. */
export const MAX_RANGE_DAYS=400;
const DAY_MS=86_400_000;
const INSTANT=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export interface TeamQuery {
  /** UTC ISO instants (toISOString), so they compare with stored timestamps as strings. */
  from:string;to:string;
  /** The selected reps after the team filter, in rep order. */
  repIds:string[];
  team:string|null;
}

/** A real instant in ISO form, normalised to UTC, or null. Rejects impossible days (Feb 30). */
export function isoInstant(value:string|null):string|null{
  if(!value||!INSTANT.test(value))return null;
  const ms=Date.parse(value);
  if(Number.isNaN(ms))return null;
  const [y,m,d]=value.slice(0,10).split('-').map(Number);
  const day=new Date(Date.UTC(y,m-1,d));
  if(day.getUTCMonth()!==m-1||day.getUTCDate()!==d)return null;
  return new Date(ms).toISOString();
}

/** The query, or the first problem in plain words. `reps` is every rep in rep order (teamReps). */
export function parseTeamQuery(params:{get(name:string):string|null},reps:readonly MetricsRep[]):{ok:true;query:TeamQuery}|{ok:false;detail:string}{
  const from=isoInstant(params.get('from')),to=isoInstant(params.get('to'));
  if(!from||!to)return {ok:false,detail:'Choose a date range: from and to are ISO date-times.'};
  const span=Date.parse(to)-Date.parse(from);
  if(span<=0)return {ok:false,detail:'The range must end after it starts.'};
  if(span>MAX_RANGE_DAYS*DAY_MS)return {ok:false,detail:`Pick a range of at most ${MAX_RANGE_DAYS} days.`};
  const asked=(params.get('reps')??'').split(',').map(id=>id.trim()).filter(Boolean);
  const unknown=asked.find(id=>!reps.some(r=>r.id===id));
  if(unknown)return {ok:false,detail:`Unknown rep: ${unknown}.`};
  const team=params.get('team')?.trim()||null;
  if(team&&!reps.some(r=>r.team===team))return {ok:false,detail:`Unknown team: ${team}.`};
  const picked=reps.filter(r=>asked.length?asked.includes(r.id):r.active).filter(r=>!team||r.team===team);
  return {ok:true,query:{from,to,repIds:picked.map(r=>r.id),team}};
}
