import type {Breakdown,MetricsRep,MetricsTeam} from '@/server/team/metrics';
import {MAX_RANGE_DAYS,isoInstant} from '@/server/team/query';

// GET /api/rep/analytics's filter (plan U6; Part 1 section 6; Appendix D; C_AN4, C_RAN2). Pure.
//
//   reps       comma-separated rep ids (inactive ones too, for history)       manager only
//   teams      comma-separated team names; a team counts its members and       manager only
//              the members of the teams inside it (plan U7, decision 47)
//   customer   one customer id; the service drops one the reader can't read
//   breakdown  org (default), rep, team or customer                            manager only
//   from, to   the window as two ISO instants the browser computed at its own midnights (OA-19), or
//   period     7, 30 (default) or 90 UTC days ending tonight, when no from/to is given
//
// A rep is forced to their own data (Appendix B; plan U6): their own quotes, one row, no team; the
// reps, teams and breakdown they send are ignored, never a 403 (as OA-68 ignores another rep's customer).
// The window is the cohort of the leaderboard, Decline reasons and Untouched quotes (decision 23:
// quotes created in it); the Overview keeps its own spans (26 weeks, all time).

export const BREAKDOWNS:readonly Breakdown[]=['org','rep','team','customer'];
/** The period presets (decision 23; C_AN6 "Created", C_RAN2 "Period"). */
export const PERIOD_DAYS=[7,30,90] as const;
export const DEFAULT_PERIOD=30;
const DAY_MS=86_400_000;

export interface AnalyticsQuery {
  /** The reps and teams the filter names (none: the whole organization). */
  reps:string[];teams:string[];
  /** Whose quotes every number covers: the reps picked (directly or by team), or null for every rep. */
  repIds:string[]|null;
  /** The leaderboard cohort's reps: repIds, or every active rep when nothing is picked. */
  cohortRepIds:string[];
  customerId:string|null;
  breakdown:Breakdown;
  /** UTC ISO instants: the cohort is the quotes created in [from, to). */
  window:{from:string;to:string};
}

export interface AnalyticsReader {repId:string;manager:boolean}

const listParam=(value:string|null)=>(value??'').split(',').map(v=>v.trim()).filter(Boolean);

/** The last `days` UTC days, today included. */
function periodWindow(days:number,now:string){
  const to=Date.UTC(new Date(now).getUTCFullYear(),new Date(now).getUTCMonth(),new Date(now).getUTCDate()+1);
  return {from:new Date(to-days*DAY_MS).toISOString(),to:new Date(to).toISOString()};
}

function parseWindow(params:{get(name:string):string|null},now:string):{ok:true;window:AnalyticsQuery['window']}|{ok:false;detail:string}{
  if(params.get('from')!==null||params.get('to')!==null){
    const from=isoInstant(params.get('from')),to=isoInstant(params.get('to'));
    if(!from||!to)return {ok:false,detail:'Choose a date range: from and to are ISO date-times.'};
    const span=Date.parse(to)-Date.parse(from);
    if(span<=0)return {ok:false,detail:'The range must end after it starts.'};
    if(span>MAX_RANGE_DAYS*DAY_MS)return {ok:false,detail:`Pick a range of at most ${MAX_RANGE_DAYS} days.`};
    return {ok:true,window:{from,to}};
  }
  const period=params.get('period')??String(DEFAULT_PERIOD);
  const days=PERIOD_DAYS.find(d=>String(d)===period);
  if(!days)return {ok:false,detail:'Pick a period of 7, 30 or 90 days, or a custom range.'};
  return {ok:true,window:periodWindow(days,now)};
}

/**
 * The query, or the first problem in plain words. `reps` is every rep in rep order (teamReps); `teams` every
 * team with the reps it counts (without it, each rep's team name stands for a team of its members).
 */
export function parseAnalyticsQuery(params:{get(name:string):string|null},{reader,reps,teams:known,now}:{reader:AnalyticsReader;reps:readonly MetricsRep[];teams?:readonly MetricsTeam[];now:string}):{ok:true;query:AnalyticsQuery}|{ok:false;detail:string}{
  const window=parseWindow(params,now);
  if(!window.ok)return window;
  const customerId=params.get('customer')?.trim()||null;
  if(!reader.manager){
    const own=[reader.repId];
    return {ok:true,query:{reps:own,teams:[],repIds:own,cohortRepIds:own,customerId,breakdown:'rep',window:window.window}};
  }
  const asked=listParam(params.get('reps'));
  const unknown=asked.find(id=>!reps.some(r=>r.id===id));
  if(unknown)return {ok:false,detail:`Unknown rep: ${unknown}.`};
  const teams=listParam(params.get('teams'));
  const listed=known??[...new Set(reps.flatMap(r=>r.team?[r.team]:[]))].map(name=>({name,rep_ids:reps.filter(r=>r.team===name).map(r=>r.id)}));
  const unknownTeam=teams.find(team=>!listed.some(t=>t.name===team));
  if(unknownTeam)return {ok:false,detail:`Unknown team: ${unknownTeam}.`};
  const breakdown=(params.get('breakdown')?.trim()||'org') as Breakdown;
  if(!BREAKDOWNS.includes(breakdown))return {ok:false,detail:`Unknown breakdown: ${breakdown}.`};
  const inTeams=new Set(listed.filter(t=>teams.includes(t.name)).flatMap(t=>t.rep_ids));
  const picked=reps.filter(r=>asked.includes(r.id)||inTeams.has(r.id)).map(r=>r.id);
  const repIds=asked.length||teams.length?picked:null;
  return {ok:true,query:{reps:reps.filter(r=>asked.includes(r.id)).map(r=>r.id),teams:[...teams].sort((a,b)=>a.localeCompare(b)),repIds,
    cohortRepIds:repIds??reps.filter(r=>r.active).map(r=>r.id),customerId,breakdown,window:window.window}};
}
